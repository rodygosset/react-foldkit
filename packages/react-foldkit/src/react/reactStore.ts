import { Array, Cause, Context, Duration, Effect, Exit, Option, Predicate, RcRef, Result, Scope } from "effect"
import { deepFreeze, isDevelopment } from "../internal/deepFreeze"
import * as InitCommand from "../internal/initCommand"
import * as Store from "../store/store"
import type * as Update from "foldkit/update"

const ReactStoreTypeId: unique symbol = Symbol.for("react-foldkit/ReactStoreTypeId")
export type ReactStoreTypeId = typeof ReactStoreTypeId

type Command<Message, R> = Update.Commands<Message, R>[number]

export type ReactStore<Model, Message> = Readonly<{
	[ReactStoreTypeId]: ReactStoreTypeId
	getModel: () => Model
	getServerModel: () => Model
	getCrash: () => Option.Option<Cause.Cause<unknown>>
	getCrashMessage: () => Option.Option<Message>
	subscribeCrash: (listener: () => void) => () => void
	subscribe: (listener: () => void) => () => void
	dispatch: (message: Message) => void
	commit: (message: Message) => Result.Result<void, Store.CommitError>
	/** Holds one lease on the live Store until the Scope closes. */
	activate: Effect.Effect<void, never, Scope.Scope>
}>

/**
 * What the Provider knows when it replaces a Store that deactivation disposed.
 *
 * @category models
 * @since 0.1.0
 */
export interface ReactivationContext<Model, Message, R = never> {
	/**
	 * The Model retained from the disposed Store.
	 */
	readonly model: Model
	/**
	 * Commands returned by update that deactivation interrupted and `restartInterrupted` did not
	 * restart, in start order. Init Commands are excluded because they restart automatically.
	 */
	readonly interrupted: Update.Commands<Message, R>
}

export type Config<Model, Message, R = never> = Store.Config<Model, Message, R> & {
	/**
	 * Creates a Message when the Provider reactivates with a replacement Store. Use it to retry
	 * interrupted work or clear pending state. It is not called on the initial activation or when
	 * `retainInactive` kept the previous Store running.
	 */
	readonly onReactivate?: (context: ReactivationContext<Model, Message, R>) => Message
	/**
	 * Keeps the Store, its Layer, Commands, and Subscriptions running for this long after the
	 * last activation ends. Reactivating within the window resumes the same Store without
	 * interrupting anything. Defaults to zero, which disposes the Store on deactivation.
	 *
	 * Work started before an unmount can still finish during the window, so keep it short when
	 * Commands perform writes or navigation.
	 */
	readonly retainInactive?: Duration.Input
	/**
	 * Starts Commands interrupted by deactivation again when a replacement Store activates. Pass
	 * `true` for all of them or a predicate to choose. Restart only idempotent work, such as
	 * Query fetches: an interrupted write may already have reached its server.
	 */
	readonly restartInterrupted?: boolean | ((command: Update.Commands<Message, R>[number]) => boolean)
	/**
	 * Freezes every Model the Provider publishes so accidental mutation throws where it happens.
	 * Plain objects and arrays are frozen; Effect values and class instances are not. Defaults to
	 * `true` outside production builds.
	 */
	readonly freezeModel?: boolean
}

export function make<Model, Message, R = never>(
	config: Config<Model, Message, R>,
	init: Update.Return<Model, Message, R>
): ReactStore<Model, Message> {
	const freeze = config.freezeModel ?? isDevelopment
	if (freeze) deepFreeze(init.model)
	const program: Store.Config<Model, Message, R> = freeze
		? { ...config, update: (model, message) => frozen(config.update(model, message)) }
		: config
	const runtime = Store.makeRuntime(program, init.model)

	// An init Command that completed does not run again on a later activation.
	const pendingInitCommands = new Set<Command<Message, R>>()
	for (const command of init.commands ?? []) {
		const tracked = InitCommand.track(command, () => pendingInitCommands.delete(tracked))
		pendingInitCommands.add(tracked)
	}
	const restartInterrupted = config.restartInterrupted ?? false
	const shouldRestart = (command: Command<Message, R>): boolean =>
		Predicate.isBoolean(restartInterrupted) ? restartInterrupted : restartInterrupted(command)

	// None until the first activation ends. Each later activation restarts the Store's live work.
	let interruptedByLastDeactivation: Option.Option<Update.Commands<Message, R>> = Option.none()
	// RcRef acquires with the Context it was made in, so each lease passes its own Context here.
	let leaseContext = Context.empty()
	let leaseExit: Exit.Exit<unknown, unknown> = Exit.void
	let leases = 0

	const acquire = Effect.gen(function* () {
		const interrupted = Option.getOrElse(interruptedByLastDeactivation, Array.empty)
		const restarted = interrupted.filter(shouldRestart)
		const kept = interrupted.filter((command) => !shouldRestart(command))
		const firstMessage = yield* Option.isNone(interruptedByLastDeactivation) || config.onReactivate === undefined
			? Effect.succeedNone
			: Effect.sync(() =>
					Option.fromUndefinedOr(config.onReactivate?.({ model: runtime.getModel(), interrupted: kept }))
				)
		const work = yield* Scope.make()
		// RcRef closes with Exit.void, so pass on the last lease's Exit instead.
		yield* Effect.addFinalizer((exit) => Scope.close(work, Exit.isFailure(exit) ? exit : leaseExit))
		yield* runtime
			.activate({ context: leaseContext, commands: [...pendingInitCommands, ...restarted], firstMessage })
			.pipe(Scope.provide(work))
		// Runs before deactivation stops the Commands, while they are still listed as running.
		yield* Effect.addFinalizer(() =>
			Effect.sync(function () {
				interruptedByLastDeactivation = Option.some(
					runtime.getRunningCommands().filter((command) => !InitCommand.isTracked(command))
				)
			})
		)
	})
	const retainFor = Duration.fromInputUnsafe(config.retainInactive ?? Duration.zero)
	const liveWork = Effect.runSync(
		RcRef.make({ acquire, idleTimeToLive: Duration.isZero(retainFor) ? undefined : retainFor }).pipe(
			Scope.provide(Scope.makeUnsafe())
		)
	)

	const activate = Effect.gen(function* () {
		leaseContext = yield* Effect.context<never>()
		// A Store that crashed while retained starts again instead of resuming.
		if (leases === 0 && Option.isSome(runtime.getCrash())) yield* RcRef.invalidate(liveWork)
		yield* RcRef.get(liveWork)
		leases += 1
		yield* Effect.addFinalizer((exit) =>
			Effect.suspend(function () {
				leases -= 1
				if (leases > 0) return Effect.void
				leaseExit = exit
				// A crashed Store does not wait out the retain window.
				return Option.isSome(runtime.getCrash()) ? RcRef.invalidate(liveWork) : Effect.void
			})
		)
	})

	return {
		[ReactStoreTypeId]: ReactStoreTypeId,
		getModel: runtime.getModel,
		getServerModel: () => init.model,
		getCrash: runtime.getCrash,
		getCrashMessage: runtime.getCrashMessage,
		subscribeCrash: runtime.subscribeCrash,
		subscribe(listener) {
			const unsubscribe = runtime.subscribe(listener)
			// React Activity can reconnect after an activation published a new Model.
			const notified = Result.try(listener)
			if (Result.isFailure(notified)) Effect.runFork(Effect.logError(Cause.die(notified.failure)))
			return unsubscribe
		},
		dispatch: runtime.dispatch,
		commit: runtime.commit,
		activate,
	}
}

function frozen<Result extends { readonly model: unknown }>(result: Result): Result {
	deepFreeze(result.model)
	return result
}
