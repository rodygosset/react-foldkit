import { Array, type Cause, Effect, Exit, Option, Result, Scope, Semaphore } from "effect"
import * as Store from "../store"
import type * as Update from "../update"
import * as InitCommand from "./init-command"

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
	subscribeCrash: (listener: () => void) => () => void
	subscribe: (listener: () => void) => () => void
	dispatch: (message: Message) => void
	commit: (message: Message) => Result.Result<void, Store.CommitError>
	/**
	 * Allocates the live store for the ambient Scope's lifetime, or takes a lease on an activation
	 * that is already running. Delivery programs join the same Scope, so they live and die with it.
	 * The last lease released ends the activation.
	 */
	activate: Effect.Effect<void, never, Scope.Scope>
}>

const trackCompletion = <Message, R>(state: InitCommandState<Message, R>): InitCommand<Message, R> =>
	InitCommand.track(state.command, function () {
		state.isComplete = true
	})

type Activation<Model, Message> = {
	readonly store: Store.Store<Model, Message>
	/**
	 * Owned here rather than by any one caller, so overlapping leases share one activation and the
	 * last one released decides when the store is disposed.
	 */
	readonly scope: Scope.Closeable
	leases: number
}

export function make<Model, Message, R = never>(
	config: Store.Config<Model, Message, R>,
	init: Update.Return<Model, Message, R>
): ReactStore<Model, Message> {
	const listeners = new Set<() => void>()
	const crashListeners = new Set<() => void>()
	const initCommandStates = (init.commands ?? []).map((command) => ({ command, isComplete: false }))
	let inactive = { model: init.model, crash: Option.none<Cause.Cause<unknown>>() }
	const serverModel = inactive.model
	let maybeActive: Option.Option<Activation<Model, Message>> = Option.none()
	const gate = Semaphore.makeUnsafe(1)

	function notifyListeners(): void {
		for (const listener of listeners) listener()
	}
	function notifyCrashListeners(): void {
		for (const listener of crashListeners) {
			const exit = Effect.runSyncExit(Effect.sync(listener))
			if (Exit.isFailure(exit)) Effect.runFork(Effect.logError(exit.cause))
		}
	}

	const release = (activation: Activation<Model, Message>, exit: Exit.Exit<unknown, unknown>): Effect.Effect<void> =>
		gate
			.withPermit(
				Effect.sync(function () {
					activation.leases -= 1
					if (activation.leases > 0) return false
					if (Option.isNone(maybeActive) || maybeActive.value !== activation) return false
					inactive = { model: activation.store.getModel(), crash: activation.store.getCrash() }
					maybeActive = Option.none()
					return true
				})
			)
			.pipe(Effect.flatMap((last) => (last ? Scope.close(activation.scope, exit) : Effect.void)))

	const acquire = Effect.gen(function* () {
		if (Option.isSome(maybeActive)) {
			const running = maybeActive.value
			running.leases += 1
			return running
		}

		// A Command that already completed must not restart on a later activation.
		const commands = Array.filterMap(initCommandStates, (state) =>
			state.isComplete ? Result.failVoid : Result.succeed(trackCompletion(state))
		)
		const scope = yield* Scope.make()
		const store = yield* Effect.gen(function* () {
			const store = yield* Store.make(config, { model: inactive.model, commands })
			yield* Effect.acquireRelease(
				Effect.sync(() => store.subscribe(notifyListeners)),
				(unsubscribe) => Effect.sync(unsubscribe)
			)
			yield* Effect.acquireRelease(
				Effect.sync(() =>
					store.subscribeCrash(function () {
						if (Option.isSome(maybeActive) && maybeActive.value.store === store) notifyCrashListeners()
					})
				),
				(unsubscribe) => Effect.sync(unsubscribe)
			)
			return store
		}).pipe(
			Scope.provide(scope),
			Effect.onExit((exit) => (Exit.isFailure(exit) ? Scope.close(scope, exit) : Effect.void))
		)
		const activation: Activation<Model, Message> = { store, scope, leases: 1 }
		maybeActive = Option.some(activation)
		return activation
	})
	const activate = Effect.acquireRelease(gate.withPermit(acquire), release).pipe(
		Effect.tap((activation) =>
			Effect.sync(function () {
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
			listener()
			return function () {
				listeners.delete(listener)
			}
		},
		dispatch(message) {
			if (Option.isSome(maybeActive)) maybeActive.value.store.dispatch(message)
		},
		commit: (message) =>
			Option.isNone(maybeActive)
				? Result.fail(new Store.CommitError({ reason: "Inactive" }))
				: maybeActive.value.store.commit(message),
		activate,
	}
}
