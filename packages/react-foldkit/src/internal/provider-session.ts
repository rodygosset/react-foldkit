import { Cause, Deferred, Duration, Effect, Exit, Option, Scope, Semaphore } from "effect"
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

interface Lifetime {
	readonly resources: Scope.Closeable
	readonly observers: Scope.Closeable
	readonly reportGate: Semaphore.Semaphore
	readonly setup: Deferred.Deferred<Exit.Exit<void, unknown>>
}

/** Live observer deadline. It bounds queue wait and execution, so a burst degrades to dropped logs. */
const liveReportDeadline: Duration.Input = "2 seconds" as const
/** Shutdown keeps the established five-second bound. */
const shutdownReportDeadline: Duration.Input = "5 seconds" as const
/** Concurrent live observers. Waiting reports share the live deadline, then drop their log. */
const maxConcurrentLiveReports = 4

type Phase =
	| { readonly _tag: "Stopped"; readonly close: Effect.Effect<void> }
	| { readonly _tag: "Running"; readonly lifetime: Lifetime; readonly close: Effect.Effect<void> }

export function make<Model, Message>(
	bootstrap: Exit.Exit<Bootstrap<Model, Message>, unknown>,
	onError: (cause: Cause.Cause<unknown>) => Effect.Effect<void, unknown>
): ProviderSession {
	const healthy = Option.none<Cause.Cause<unknown>>()
	const initialFailure = Exit.isFailure(bootstrap) ? Option.some(bootstrap.cause) : healthy
	let snapshot = initialFailure
	let observedCrash: Option.Option<Cause.Cause<unknown>> = Option.none()
	let phase: Phase = { _tag: "Stopped", close: Effect.void }
	const listeners = new Set<() => void>()

	function publish(value: Option.Option<Cause.Cause<unknown>>): void {
		if (Option.isNone(value) && Option.isNone(snapshot)) return
		snapshot = value
		for (const listener of listeners) listener()
	}
	function fail(cause: Cause.Cause<unknown>): void {
		publish(Option.some(cause))
	}
	function recover(): void {
		publish(healthy)
	}
	const isRunning = (lifetime: Lifetime) => phase._tag === "Running" && phase.lifetime === lifetime
	const crash = () => (Exit.isSuccess(bootstrap) ? bootstrap.value.store.getCrash() : Option.none())

	// Observer failures are logged here. They never reach renderError.
	const report = (cause: Cause.Cause<unknown>): Effect.Effect<void, never> =>
		Effect.suspend(() => onError(cause)).pipe(
			Effect.catchCause(function (observed) {
				if (Cause.hasInterruptsOnly(observed)) return Effect.void
				return Effect.logError(observed)
			}),
			Effect.interruptible
		)

	// Single owner for live observer lifetime. The gate caps concurrency, the
	// deadline bounds queue wait and execution, and scope close interrupts stragglers.
	const reportToObservers = (lifetime: Lifetime, cause: Cause.Cause<unknown>): Effect.Effect<void, never> =>
		Semaphore.withPermits(
			lifetime.reportGate,
			1
		)(report(cause)).pipe(
			Effect.timeoutOption(liveReportDeadline),
			Effect.asVoid,
			Effect.interruptible,
			Effect.forkIn(lifetime.observers, { startImmediately: true, uninterruptible: false }),
			Effect.asVoid
		)

	function scheduleReport(lifetime: Lifetime, cause: Cause.Cause<unknown>): void {
		Effect.runFork(reportToObservers(lifetime, cause))
	}

	function observeCrash(lifetime: Lifetime): boolean {
		if (!isRunning(lifetime)) return false
		const current = crash()
		if (Option.isNone(current)) return false
		if (Option.isSome(observedCrash) && observedCrash.value === current.value) return true
		observedCrash = current
		fail(current.value)
		scheduleReport(lifetime, current.value)
		return true
	}

	function reconcile(lifetime: Lifetime, exit: Exit.Exit<void, unknown>): void {
		if (!isRunning(lifetime) || observeCrash(lifetime)) return
		if (Exit.isSuccess(exit)) {
			recover()
			return
		}
		fail(exit.cause)
		scheduleReport(lifetime, exit.cause)
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
				if (isRunning(lifetime) && !terminal) fail(exit.cause)
				const cleanup = yield* Effect.exit(Scope.close(lifetime.resources, exit))
				const finalized = Exit.asVoidAll([exit, cleanup])
				if (isRunning(lifetime) && Exit.isFailure(finalized)) {
					if (Exit.isFailure(cleanup) && !Cause.hasInterruptsOnly(cleanup.cause))
						yield* Effect.logError(cleanup.cause)
					if (!terminal) {
						publish(Option.some(finalized.cause))
						yield* reportToObservers(lifetime, finalized.cause)
					} else if (Exit.isFailure(cleanup)) {
						const current = crash()
						const cause = Option.isSome(current)
							? Cause.combine(current.value, cleanup.cause)
							: cleanup.cause
						fail(cause)
						yield* reportToObservers(lifetime, cause)
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
		})

	const start = Effect.gen(function* () {
		if (phase._tag === "Running") return
		const lifetime: Lifetime = {
			resources: yield* Scope.make(),
			observers: yield* Scope.make(),
			reportGate: yield* Semaphore.make(maxConcurrentLiveReports),
			setup: yield* Deferred.make<Exit.Exit<void, unknown>>(),
		}
		const closing: Effect.Effect<void> = yield* Effect.cached(
			Effect.gen(function* () {
				const exit = yield* Effect.gen(function* () {
					const exit = yield* release(lifetime)
					if (Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)) {
						if (phase.close === closing) publish(Option.some(exit.cause))
						yield* Effect.logError(exit.cause)
					}
					return exit
				}).pipe(Effect.uninterruptible)
				if (Exit.isSuccess(exit) || Cause.hasInterruptsOnly(exit.cause)) return
				yield* report(exit.cause).pipe(
					Effect.timeoutOption(shutdownReportDeadline),
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
