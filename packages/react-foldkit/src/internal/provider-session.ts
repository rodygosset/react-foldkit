import { Cause, Deferred, Effect, Exit, Option, Scope } from "effect"
import type { Connection } from "./commit-source"
import type { ModelReader } from "./model-source"
import type { ReactStore } from "./react-store"

export interface Bootstrap<Model, Message> {
	readonly store: ReactStore<Model, Message>
	readonly connection?: Connection<Message, unknown>
}

export interface ProviderSession extends ModelReader<Option.Option<Cause.Cause<unknown>>> {
	readonly start: Effect.Effect<void>
	readonly stop: Effect.Effect<void>
}

type Revision = object

type Presentation =
	| { readonly _tag: "Healthy" }
	| { readonly _tag: "Recoverable"; readonly cause: Cause.Cause<unknown> }
	| { readonly _tag: "Terminal"; readonly cause: Cause.Cause<unknown> }

interface Lifetime {
	readonly resources: Scope.Closeable
	readonly observers: Scope.Closeable
	readonly setup: Deferred.Deferred<Exit.Exit<void, unknown>>
	readonly closingRevision: Revision
}

type Phase =
	| { readonly _tag: "Stopped"; readonly close: Effect.Effect<void> }
	| { readonly _tag: "Running"; readonly lifetime: Lifetime; readonly close: Effect.Effect<void> }

export function make<Model, Message>(
	bootstrap: Exit.Exit<Bootstrap<Model, Message>, unknown>,
	onError: (cause: Cause.Cause<unknown>) => Effect.Effect<void, unknown>
): ProviderSession {
	const healthy = Option.none<Cause.Cause<unknown>>()
	const initialFailure = Exit.isFailure(bootstrap) ? Option.some(bootstrap.cause) : healthy
	let presentation: Presentation = Exit.isFailure(bootstrap)
		? { _tag: "Recoverable", cause: bootstrap.cause }
		: { _tag: "Healthy" }
	let snapshot = initialFailure
	let latest: Revision = {}
	let observedCrash: Option.Option<Cause.Cause<unknown>> = Option.none()
	let phase: Phase = { _tag: "Stopped", close: Effect.void }
	const listeners = new Set<() => void>()

	function publish(value: Presentation, revision: Revision): void {
		if (revision !== latest || (value._tag === "Healthy" && presentation._tag === "Healthy")) return
		presentation = value
		snapshot = value._tag === "Healthy" ? healthy : Option.some(value.cause)
		for (const listener of listeners) listener()
	}
	function fail(cause: Cause.Cause<unknown>, terminal = false): Revision {
		const revision = (latest = {})
		publish({ _tag: terminal ? "Terminal" : "Recoverable", cause }, revision)
		return revision
	}
	function recover(): void {
		publish({ _tag: "Healthy" }, (latest = {}))
	}
	const isRunning = (lifetime: Lifetime) => phase._tag === "Running" && phase.lifetime === lifetime
	const crash = () => (Exit.isSuccess(bootstrap) ? bootstrap.value.store.getCrash() : Option.none())

	const report = (cause: Cause.Cause<unknown>, revision: Revision): Effect.Effect<void> =>
		Effect.suspend(() => onError(cause)).pipe(
			Effect.onExit(function (observed) {
				if (Exit.isSuccess(observed) || Cause.hasInterruptsOnly(observed.cause)) return Effect.void
				const reported = Cause.combine(cause, observed.cause)
				if (revision === latest) {
					publish(
						{
							_tag: presentation._tag === "Terminal" ? "Terminal" : "Recoverable",
							cause: reported,
						},
						revision
					)
				}
				return Effect.void
			}),
			Effect.ignoreCause,
			Effect.interruptible
		)

	function observeCrash(lifetime: Lifetime): boolean {
		if (!isRunning(lifetime)) return false
		const current = crash()
		if (Option.isNone(current)) return false
		if (Option.isSome(observedCrash) && observedCrash.value === current.value) return true
		observedCrash = current
		const revision = fail(current.value, true)
		Effect.runFork(
			Effect.forkIn(report(current.value, revision), lifetime.observers, {
				startImmediately: true,
				uninterruptible: false,
			})
		)
		return true
	}

	function reconcile(lifetime: Lifetime, exit: Exit.Exit<void, unknown>): void {
		if (!isRunning(lifetime) || observeCrash(lifetime)) return
		if (Exit.isSuccess(exit)) {
			if (presentation._tag === "Recoverable") recover()
			return
		}
		const revision = fail(exit.cause)
		Effect.runFork(
			Effect.forkIn(report(exit.cause, revision), lifetime.observers, {
				startImmediately: true,
				uninterruptible: false,
			})
		)
	}

	const setup = (lifetime: Lifetime): Effect.Effect<void> =>
		Effect.uninterruptibleMask((restore) =>
			Effect.gen(function* () {
				const exit = yield* Effect.exit(
					restore(
						Effect.gen(function* () {
							const { store, connection } = yield* bootstrap
							yield* Effect.acquireRelease(
								Effect.sync(() => store.subscribeCrash(() => observeCrash(lifetime))),
								(unsubscribe) => Effect.sync(unsubscribe)
							)
							yield* store.activate
							if (isRunning(lifetime) && !observeCrash(lifetime)) recover()
							if (connection !== undefined)
								yield* connection.connect(store.commit, (exit) => reconcile(lifetime, exit))
						}).pipe(Scope.provide(lifetime.resources))
					)
				)
				if (Exit.isSuccess(exit)) return
				const terminal = observeCrash(lifetime)
				const revision = isRunning(lifetime) ? (terminal ? latest : fail(exit.cause)) : lifetime.closingRevision
				const cleanup = yield* Effect.exit(Scope.close(lifetime.resources, exit))
				const finalized = Exit.asVoidAll([exit, cleanup])
				if (isRunning(lifetime) && Exit.isFailure(finalized)) {
					if (Exit.isFailure(cleanup) && !Cause.hasInterruptsOnly(cleanup.cause))
						yield* Effect.logError(cleanup.cause)
					if (!terminal) {
						publish({ _tag: "Recoverable", cause: finalized.cause }, revision)
						yield* Effect.forkIn(report(finalized.cause, revision), lifetime.observers, {
							startImmediately: true,
							uninterruptible: false,
						})
					} else if (Exit.isFailure(cleanup)) {
						const current = crash()
						const cause = Option.isSome(current)
							? Cause.combine(current.value, cleanup.cause)
							: cleanup.cause
						const cleanupRevision = fail(cause, true)
						yield* Effect.forkIn(report(cause, cleanupRevision), lifetime.observers, {
							startImmediately: true,
							uninterruptible: false,
						})
					}
					return
				}
				return yield* finalized
			}).pipe(
				Effect.onExit((exit) => Deferred.succeed(lifetime.setup, exit)),
				Effect.ignoreCause
			)
		)

	const release = (lifetime: Lifetime): Effect.Effect<Exit.Exit<void, unknown>> =>
		Effect.gen(function* () {
			const closed = yield* Effect.all(
				[
					Effect.exit(Scope.close(lifetime.resources, Exit.void)),
					Effect.exit(Scope.close(lifetime.observers, Exit.void)),
				],
				{ concurrency: "unbounded" }
			)
			const setup = yield* Deferred.await(lifetime.setup)
			return Exit.asVoidAll([...closed, setup])
		}).pipe(Effect.uninterruptible)

	const start = Effect.gen(function* () {
		if (phase._tag === "Running") return
		const lifetime: Lifetime = {
			resources: yield* Scope.make(),
			observers: yield* Scope.make(),
			setup: yield* Deferred.make<Exit.Exit<void, unknown>>(),
			closingRevision: {},
		}
		const closing = yield* Effect.cached(
			Effect.gen(function* () {
				const exit = yield* Effect.gen(function* () {
					const exit = yield* release(lifetime)
					if (Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)) {
						publish({ _tag: "Recoverable", cause: exit.cause }, lifetime.closingRevision)
						yield* Effect.logError(exit.cause)
					}
					return exit
				}).pipe(Effect.uninterruptible)
				if (Exit.isSuccess(exit) || Cause.hasInterruptsOnly(exit.cause)) return
				yield* report(exit.cause, lifetime.closingRevision).pipe(
					Effect.timeoutOption("5 seconds"),
					Effect.asVoid,
					Effect.interruptible
				)
			})
		)
		phase = { _tag: "Running", lifetime, close: closing }
		yield* Effect.forkIn(setup(lifetime), lifetime.observers, { startImmediately: true, uninterruptible: false })
	}).pipe(Effect.uninterruptible)
	const stop = Effect.suspend(function () {
		if (phase._tag === "Running") {
			latest = phase.lifetime.closingRevision
			phase = { _tag: "Stopped", close: phase.close }
		}
		return phase.close
	})

	return {
		getSnapshot: () => snapshot,
		getServerSnapshot: () => initialFailure,
		subscribe(listener) {
			listeners.add(listener)
			// React Activity retains the previous store value while its subscription is detached.
			listener()
			return function () {
				listeners.delete(listener)
			}
		},
		start,
		stop,
	}
}
