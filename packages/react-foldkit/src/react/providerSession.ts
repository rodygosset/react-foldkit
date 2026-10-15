import { Cause, Context, Duration, Effect, Exit, Option, Scope, Semaphore } from "effect"
import type { Connection } from "../commitSource/connection"
import type { ModelReader } from "../modelSource"
import type { ReactStore } from "./reactStore"

export interface Bootstrap<Model, Message> {
	readonly store: ReactStore<Model, Message>
	readonly connection?: Connection<Message, unknown>
}

export interface Snapshot {
	readonly cause: Option.Option<Cause.Cause<unknown>>
}

export interface ProviderSession extends ModelReader<Snapshot> {
	readonly start: Effect.Effect<void>
	readonly stop: Effect.Effect<void>
}

interface Lifetime {
	readonly context: Context.Context<never>
	readonly resources: Scope.Closeable
	readonly observers: Scope.Closeable
	readonly reportGate: Semaphore.Semaphore
}

const liveReportDeadline: Duration.Input = "2 seconds" as const

const shutdownReportDeadline: Duration.Input = "5 seconds" as const

const maxConcurrentTransientReports = 4

export function make<Model, Message>(
	bootstrap: Exit.Exit<Bootstrap<Model, Message>, unknown>,
	onError: (cause: Cause.Cause<unknown>) => Effect.Effect<void, unknown>
): ProviderSession {
	const healthy = Option.none<Cause.Cause<unknown>>()
	const initialFailure = Exit.isFailure(bootstrap) ? Option.some(bootstrap.cause) : healthy
	const initialSnapshot: Snapshot = { cause: initialFailure }
	let snapshot = initialSnapshot
	let observedCrash: Option.Option<Cause.Cause<unknown>> = Option.none()
	let running: Lifetime | undefined
	// The latest lifetime's shutdown. A later stop waits for it instead of releasing again.
	let shutdown: Effect.Effect<void> = Effect.void
	const listeners = new Set<() => void>()

	function publish(value: Option.Option<Cause.Cause<unknown>>): void {
		if (Option.isNone(value) && Option.isNone(snapshot.cause)) return
		// Recovery needs a fresh snapshot even when Activity retained an earlier healthy value.
		snapshot = { cause: value }
		for (const listener of listeners) listener()
	}
	function fail(cause: Cause.Cause<unknown>): void {
		publish(Option.some(cause))
	}
	function recover(): void {
		observedCrash = Option.none()
		publish(healthy)
	}
	const isRunning = (lifetime: Lifetime) => running === lifetime
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

	// Reports run in the lifetime's observers Scope, so stop interrupts them, and each has a deadline.
	const forkReport = (lifetime: Lifetime, reporting: Effect.Effect<unknown>): Effect.Effect<void> =>
		reporting.pipe(
			Effect.timeoutOption(liveReportDeadline),
			Effect.forkIn(lifetime.observers, { startImmediately: true, uninterruptible: false }),
			Effect.asVoid
		)

	// Transient failures share a few permits. A report that finds none free is dropped.
	const reportTransient = (lifetime: Lifetime, cause: Cause.Cause<unknown>): Effect.Effect<void> =>
		forkReport(lifetime, Semaphore.withPermitsIfAvailable(lifetime.reportGate, 1)(report(cause)))

	// A terminal crash skips the permits, so its report runs even when transient reports hold all of them.
	const reportTerminal = (lifetime: Lifetime, cause: Cause.Cause<unknown>): Effect.Effect<void> =>
		forkReport(lifetime, report(cause))

	function observeCrash(lifetime: Lifetime): boolean {
		if (!isRunning(lifetime)) return false
		const current = crash()
		if (Option.isNone(current)) return false
		if (Option.isSome(observedCrash) && observedCrash.value === current.value) return true
		observedCrash = current
		fail(current.value)
		Effect.runForkWith(lifetime.context)(reportTerminal(lifetime, current.value))
		return true
	}

	function reconcile(lifetime: Lifetime, exit: Exit.Exit<void, unknown>): void {
		if (!isRunning(lifetime) || observeCrash(lifetime)) return
		if (Exit.isSuccess(exit)) {
			recover()
			return
		}
		fail(exit.cause)
		Effect.runForkWith(lifetime.context)(reportTransient(lifetime, exit.cause))
	}

	const setup = (lifetime: Lifetime): Effect.Effect<void> =>
		Effect.uninterruptibleMask((restore) =>
			Effect.gen(function* () {
				let activationSucceeded = false
				const exit = yield* Effect.exit(
					restore(
						Effect.gen(function* () {
							const { store, connection } = yield* bootstrap
							yield* Effect.acquireRelease(
								Effect.sync(() => store.subscribeCrash(() => observeCrash(lifetime))),
								(unsubscribe) => Effect.sync(unsubscribe)
							)
							yield* store.activate
							activationSucceeded = true
							if (isRunning(lifetime) && !observeCrash(lifetime)) recover()
							if (connection !== undefined)
								yield* connection.connect(store.commit, (exit) => reconcile(lifetime, exit))
						}).pipe(Scope.provide(lifetime.resources))
					)
				)
				if (Exit.isSuccess(exit)) return
				const terminal = activationSucceeded && observeCrash(lifetime)
				if (isRunning(lifetime) && !terminal) fail(exit.cause)
				const cleanup = yield* Effect.exit(Scope.close(lifetime.resources, exit))
				const finalized = Exit.asVoidAll([exit, cleanup])
				if (isRunning(lifetime) && Exit.isFailure(finalized)) {
					if (Exit.isFailure(cleanup) && !Cause.hasInterruptsOnly(cleanup.cause))
						yield* Effect.logError(cleanup.cause)
					if (!terminal) {
						publish(Option.some(finalized.cause))
						yield* reportTransient(lifetime, finalized.cause)
					} else if (Exit.isFailure(cleanup)) {
						const current = crash()
						const cause = Option.isSome(current)
							? Cause.combine(current.value, cleanup.cause)
							: cleanup.cause
						fail(cause)
						yield* reportTransient(lifetime, cause)
					}
					return
				}
				return yield* finalized
			}).pipe(Effect.ignoreCause)
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
			return Exit.asVoidAll(closed)
		})

	const start = Effect.gen(function* () {
		if (running !== undefined) return
		const lifetime: Lifetime = {
			context: yield* Effect.context<never>(),
			resources: yield* Scope.make(),
			observers: yield* Scope.make(),
			reportGate: yield* Semaphore.make(maxConcurrentTransientReports),
		}
		const closing: Effect.Effect<void> = yield* Effect.cached(
			Effect.gen(function* () {
				const exit = yield* release(lifetime)
				if (Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)) {
					if (shutdown === closing) publish(Option.some(exit.cause))
					yield* Effect.logError(exit.cause)
				}
				if (Exit.isSuccess(exit) || Cause.hasInterruptsOnly(exit.cause)) return
				yield* report(exit.cause).pipe(
					Effect.timeoutOption(shutdownReportDeadline),
					Effect.asVoid,
					Effect.interruptible
				)
			}).pipe(Effect.provideContext(lifetime.context))
		)
		running = lifetime
		shutdown = closing
		yield* Effect.forkIn(setup(lifetime), lifetime.observers, { startImmediately: true, uninterruptible: false })
	}).pipe(Effect.uninterruptible)
	const stop = Effect.suspend(function () {
		running = undefined
		return shutdown
	})

	return {
		getSnapshot: () => snapshot,
		getServerSnapshot: () => initialSnapshot,
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
