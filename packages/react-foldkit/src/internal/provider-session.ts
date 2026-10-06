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
	const initialFailure = Exit.isFailure(bootstrap) ? Option.some(bootstrap.cause) : Option.none()
	let failure = initialFailure
	let latest: Revision = {}
	let phase: Phase = { _tag: "Stopped", close: Effect.void }
	const listeners = new Set<() => void>()

	function publish(value: Option.Option<Cause.Cause<unknown>>, revision: Revision): void {
		if (revision !== latest || value === failure) return
		failure = value
		for (const listener of listeners) listener()
	}
	function fail(cause: Cause.Cause<unknown>): Revision {
		const revision = (latest = {})
		publish(Option.some(cause), revision)
		return revision
	}
	function recover(): void {
		publish(Option.none(), (latest = {}))
	}
	const isRunning = (lifetime: Lifetime) => phase._tag === "Running" && phase.lifetime === lifetime

	const report = (cause: Cause.Cause<unknown>, revision: Revision, cleanup: boolean): Effect.Effect<void> =>
		Effect.suspend(function () {
			publish(Option.some(cause), revision)
			return onError(cause)
		}).pipe(
			Effect.onExit(function (observed) {
				const reported =
					Exit.isFailure(observed) && !Cause.hasInterruptsOnly(observed.cause)
						? Cause.combine(cause, observed.cause)
						: cause
				if (reported !== cause) publish(Option.some(reported), revision)
				return cleanup ? Effect.logError(reported) : Effect.void
			}),
			Effect.ignoreCause
		)

	function reconcile(lifetime: Lifetime, exit: Exit.Exit<void, unknown>): void {
		if (!isRunning(lifetime)) return
		if (Exit.isSuccess(exit)) {
			recover()
			return
		}
		const revision = fail(exit.cause)
		Effect.runFork(
			Effect.forkIn(report(exit.cause, revision, false), lifetime.observers, { startImmediately: true })
		)
	}

	const setup = (lifetime: Lifetime): Effect.Effect<void> =>
		Effect.uninterruptibleMask((restore) =>
			Effect.gen(function* () {
				const exit = yield* Effect.exit(
					restore(
						Effect.gen(function* () {
							const { store, connection } = yield* bootstrap
							yield* store.activate
							if (connection !== undefined)
								yield* connection.connect(store.commit, (exit) => reconcile(lifetime, exit))
						}).pipe(Scope.provide(lifetime.resources))
					)
				)
				if (Exit.isSuccess(exit)) {
					if (isRunning(lifetime)) recover()
					return
				}
				const revision = isRunning(lifetime) ? fail(exit.cause) : lifetime.closingRevision
				const finalized = yield* Effect.exit(exit.pipe(Effect.ensuring(Scope.close(lifetime.resources, exit))))
				if (isRunning(lifetime) && Exit.isFailure(finalized)) {
					yield* Effect.forkIn(report(finalized.cause, revision, false), lifetime.observers, {
						startImmediately: true,
						uninterruptible: false,
					})
					return
				}
				return yield* finalized
			}).pipe(
				Effect.onExit((exit) => Deferred.succeed(lifetime.setup, exit)),
				Effect.ignoreCause
			)
		)

	const close = (lifetime: Lifetime): Effect.Effect<void> =>
		Effect.gen(function* () {
			const closed = yield* Effect.all(
				[
					Effect.exit(Scope.close(lifetime.resources, Exit.void)),
					Effect.exit(Scope.close(lifetime.observers, Exit.void)),
				],
				{ concurrency: "unbounded" }
			)
			const setup = yield* Deferred.await(lifetime.setup)
			return yield* Exit.asVoidAll([...closed, setup])
		}).pipe(
			Effect.catchCause((cause) =>
				Cause.hasInterruptsOnly(cause) ? Effect.void : report(cause, lifetime.closingRevision, true)
			),
			Effect.scoped
		)

	const start = Effect.gen(function* () {
		if (phase._tag === "Running") return
		const lifetime: Lifetime = {
			resources: yield* Scope.make(),
			observers: yield* Scope.make(),
			setup: yield* Deferred.make<Exit.Exit<void, unknown>>(),
			closingRevision: {},
		}
		const closing = yield* Effect.cached(Effect.uninterruptible(close(lifetime)))
		phase = { _tag: "Running", lifetime, close: closing }
		yield* Effect.forkIn(setup(lifetime), lifetime.observers, { startImmediately: true })
	})
	const stop = Effect.suspend(function () {
		if (phase._tag === "Running") {
			latest = phase.lifetime.closingRevision
			phase = { _tag: "Stopped", close: phase.close }
		}
		return phase.close
	})

	return {
		getSnapshot: () => failure,
		getServerSnapshot: () => initialFailure,
		subscribe(listener) {
			listeners.add(listener)
			return function () {
				listeners.delete(listener)
			}
		},
		start,
		stop,
	}
}
