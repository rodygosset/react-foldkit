import { Array, Cause, Duration, Effect, Exit, Fiber, Option, Result, Scope, Semaphore } from "effect"
import { deepFreeze, isDevelopment } from "../internal/deepFreeze"
import * as InitCommand from "../internal/initCommand"
import * as Store from "../store/store"
import type * as Update from "foldkit/update"

const ReactStoreTypeId: unique symbol = Symbol.for("react-foldkit/ReactStoreTypeId")
export type ReactStoreTypeId = typeof ReactStoreTypeId

type InitCommand<Message, R> = Update.Commands<Message, R>[number]

type InitCommandState<Message, R> = {
	readonly command: InitCommand<Message, R>
	isComplete: boolean
}

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
	activate: Effect.Effect<void, Store.CommitError, Scope.Scope>
}>

const trackCompletion = <Message, R>(state: InitCommandState<Message, R>): InitCommand<Message, R> =>
	InitCommand.track(state.command, function () {
		state.isComplete = true
	})

type Activation<Model, Message> = {
	readonly store: Store.Store<Model, Message>
	readonly scope: Scope.Closeable
	leases: number
	expiry: Option.Option<Fiber.Fiber<void>>
}

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

/** Messages kept while no Store is active before the oldest are dropped. */
const maxInactiveMessages = 1000

export function make<Model, Message, R = never>(
	input: Config<Model, Message, R>,
	init: Update.Return<Model, Message, R>
): ReactStore<Model, Message> {
	const freeze = input.freezeModel ?? isDevelopment
	let crashMessage: Option.Option<Message> = Option.none()
	const update: Config<Model, Message, R>["update"] = freeze
		? function (model, message) {
				const result = input.update(model, message)
				deepFreeze(result.model)
				return result
			}
		: input.update
	function onCrash(cause: Cause.Cause<unknown>, triggeringMessage: Option.Option<Message>): void {
		crashMessage = triggeringMessage
		if (input.onCrash !== undefined) input.onCrash(cause, triggeringMessage)
		else Effect.runFork(Effect.logError("[react-foldkit] Store crashed:", Cause.pretty(cause)))
	}
	// Spreading keeps `resources`; TypeScript cannot re-check the conditional Config type.
	const config = { ...input, update, onCrash } as Config<Model, Message, R>
	if (freeze) deepFreeze(init.model)
	const listeners = new Set<() => void>()
	const crashListeners = new Set<() => void>()
	const initCommandStates = (init.commands ?? []).map((command) => ({ command, isComplete: false }))
	let inactive: {
		readonly _tag: "Initial" | "Replacement"
		readonly model: Model
		readonly crash: Option.Option<Cause.Cause<unknown>>
		readonly interrupted: Update.Commands<Message, R>
	} = { _tag: "Initial", model: init.model, crash: Option.none(), interrupted: [] }
	const serverModel = inactive.model
	let maybeActive: Option.Option<Activation<Model, Message>> = Option.none()
	let inactiveMessages: Array<Message> = []
	let warnedInactiveOverflow = false
	const retainFor = Duration.fromInputUnsafe(config.retainInactive ?? Duration.zero)
	const gate = Semaphore.makeUnsafe(1)

	function notifyListeners(): void {
		const observers = [...listeners]
		for (const listener of observers) {
			const exit = Effect.runSyncExit(Effect.sync(listener))
			if (Exit.isFailure(exit)) Effect.runFork(Effect.logError(exit.cause))
		}
	}
	function notifyCrashListeners(): void {
		const observers = [...crashListeners]
		for (const listener of observers) {
			const exit = Effect.runSyncExit(Effect.sync(listener))
			if (Exit.isFailure(exit)) Effect.runFork(Effect.logError(exit.cause))
		}
	}

	// Moves the Store's final state into the inactive snapshot. Call while holding the gate.
	function retire(activation: Activation<Model, Message>): void {
		inactive = {
			_tag: "Replacement",
			model: activation.store.getModel(),
			crash: activation.store.getCrash(),
			// Read before closing: disposal interrupts these Commands and removes them.
			interrupted: activation.store
				.getRunningCommands()
				.filter((command) => !InitCommand.isTracked(command)) as Update.Commands<Message, R>,
		}
		maybeActive = Option.none()
	}

	const closeQuietly = (scope: Scope.Closeable, exit: Exit.Exit<unknown, unknown>): Effect.Effect<void> =>
		Scope.close(scope, exit).pipe(Effect.catchCause(Effect.logError))

	const expire = (activation: Activation<Model, Message>, exit: Exit.Exit<unknown, unknown>): Effect.Effect<void> =>
		gate
			.withPermit(
				Effect.sync(function () {
					if (Option.isNone(maybeActive) || maybeActive.value !== activation) return false
					retire(activation)
					return true
				})
			)
			.pipe(Effect.flatMap((last) => (last ? closeQuietly(activation.scope, exit) : Effect.void)))

	const release = (activation: Activation<Model, Message>, exit: Exit.Exit<unknown, unknown>): Effect.Effect<void> =>
		gate
			.withPermit(
				Effect.sync(function (): "Keep" | "Retain" | "Close" {
					activation.leases -= 1
					if (activation.leases > 0) return "Keep"
					if (Option.isNone(maybeActive) || maybeActive.value !== activation) return "Keep"
					if (Duration.isZero(retainFor) || Option.isSome(activation.store.getCrash())) {
						retire(activation)
						return "Close"
					}
					// The release Scope is ending, so the expiry timer runs detached from it.
					activation.expiry = Option.some(
						Effect.runFork(Effect.sleep(retainFor).pipe(Effect.andThen(expire(activation, exit))))
					)
					return "Retain"
				})
			)
			.pipe(
				Effect.flatMap((outcome) => (outcome === "Close" ? Scope.close(activation.scope, exit) : Effect.void))
			)

	function flushInactiveMessages(store: Store.Store<Model, Message>): void {
		const messages = inactiveMessages
		inactiveMessages = []
		for (const message of messages) store.dispatch(message)
	}

	const acquire = Effect.gen(function* () {
		if (Option.isSome(maybeActive)) {
			const running = maybeActive.value
			if (running.leases > 0 || Option.isNone(running.store.getCrash())) {
				if (Option.isSome(running.expiry)) {
					const expiry = running.expiry.value
					running.expiry = Option.none()
					yield* Fiber.interrupt(expiry)
				}
				running.leases += 1
				return running
			}
			// A retained Store that crashed is replaced like a disposed one.
			retire(running)
			yield* closeQuietly(running.scope, Exit.void)
		}

		// A Command that already completed must not restart on a later activation.
		const initCommands = Array.filterMap(initCommandStates, (state) =>
			state.isComplete ? Result.failVoid : Result.succeed(trackCompletion(state))
		)
		const restart = config.restartInterrupted ?? false
		const shouldRestart = (command: Update.Commands<Message, R>[number]) =>
			restart === true || (restart !== false && restart(command))
		const restarted = inactive.interrupted.filter(shouldRestart)
		const kept = inactive.interrupted.filter((command) => !shouldRestart(command))
		const commands = [...initCommands, ...restarted]
		const scope = yield* Scope.make()
		crashMessage = Option.none()
		const store = yield* Effect.gen(function* () {
			const store = yield* Store.make(config, { model: inactive.model, commands })
			store.subscribe(notifyListeners)
			yield* Effect.acquireRelease(
				Effect.sync(() =>
					store.subscribeCrash(function () {
						if (Option.isSome(maybeActive) && maybeActive.value.store === store) notifyCrashListeners()
					})
				),
				(unsubscribe) => Effect.sync(unsubscribe)
			)
			if (inactive._tag === "Replacement" && config.onReactivate !== undefined) {
				const context: ReactivationContext<Model, Message, R> = {
					model: inactive.model,
					interrupted: kept,
				}
				const message = yield* Effect.sync(() => config.onReactivate?.(context))
				if (message !== undefined) store.commit(message)
			}
			return store
		}).pipe(
			Scope.provide(scope),
			Effect.onExit((exit) => (Exit.isFailure(exit) ? Scope.close(scope, exit) : Effect.void))
		)
		const activation: Activation<Model, Message> = { store, scope, leases: 1, expiry: Option.none() }
		maybeActive = Option.some(activation)
		return activation
	})
	const activate = Effect.acquireRelease(gate.withPermit(acquire), release).pipe(
		Effect.tap((activation) =>
			Effect.sync(function () {
				flushInactiveMessages(activation.store)
				notifyCrashListeners()
				if (activation.store.getModel() !== inactive.model) notifyListeners()
			})
		),
		Effect.asVoid
	)

	return {
		[ReactStoreTypeId]: ReactStoreTypeId,
		getModel: () => (Option.isNone(maybeActive) ? inactive.model : maybeActive.value.store.getModel()),
		getCrash: () => (Option.isNone(maybeActive) ? inactive.crash : maybeActive.value.store.getCrash()),
		getCrashMessage: () => crashMessage,
		subscribeCrash(listener) {
			crashListeners.add(listener)
			return function () {
				crashListeners.delete(listener)
			}
		},
		getServerModel: () => serverModel,
		subscribe(listener) {
			listeners.add(listener)
			// Activity may reconnect after activation published a new Model.
			const exit = Effect.runSyncExit(Effect.sync(listener))
			if (Exit.isFailure(exit)) Effect.runFork(Effect.logError(exit.cause))
			return function () {
				listeners.delete(listener)
			}
		},
		dispatch(message) {
			if (Option.isSome(maybeActive)) {
				maybeActive.value.store.dispatch(message)
				return
			}
			// Hold Messages sent while React has deactivated the Provider and deliver them on activation.
			inactiveMessages.push(message)
			if (inactiveMessages.length > maxInactiveMessages) {
				inactiveMessages.shift()
				if (!warnedInactiveOverflow) {
					warnedInactiveOverflow = true
					Effect.runFork(
						Effect.logWarning(
							`[react-foldkit] Dropping Messages dispatched while the Provider is inactive; more than ${maxInactiveMessages} are waiting.`
						)
					)
				}
			}
		},
		commit: (message) =>
			Option.isNone(maybeActive)
				? Result.fail(new Store.CommitError({ reason: new Store.Inactive() }))
				: maybeActive.value.store.commit(message),
		activate,
	}
}
