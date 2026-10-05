import { Array, Effect, Exit, Option, Result, Scope } from "effect"
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
	subscribe: (listener: () => void) => () => void
	dispatch: (message: Message) => void
	commit: (message: Message) => Result.Result<void, Store.CommitError>
	onActivate: <E>(connect: Effect.Effect<void, E, Scope.Scope>) => Effect.Effect<Effect.Effect<void>, E>
	activate: Effect.Effect<Effect.Effect<void>, unknown>
}>

const trackCompletion = <Message, R>(state: InitCommandState<Message, R>): InitCommand<Message, R> =>
	InitCommand.track(state.command, function () {
		state.isComplete = true
	})

type Connection<E = unknown> = {
	readonly connect: Effect.Effect<void, E, Scope.Scope>
	maybeScope: Option.Option<Scope.Closeable>
}

type Activation<Model, Message> = {
	readonly store: Store.Store<Model, Message>
	readonly scope: Scope.Closeable
}

export function make<Model, Message, R = never>(
	config: Store.Config<Model, Message, R>,
	init: Update.Return<Model, Message, R>
): ReactStore<Model, Message> {
	const listeners = new Set<() => void>()
	const initCommands = init.commands ?? []
	const initCommandStates = initCommands.map((command) => ({ command, isComplete: false }))
	let inactiveModel = init.model
	const serverModel = inactiveModel
	let maybeActive: Option.Option<Activation<Model, Message>> = Option.none()
	const connections = new Set<Connection>()

	const release = (connection: Connection): Effect.Effect<void> =>
		Effect.suspend(function () {
			connections.delete(connection)
			return Option.match(connection.maybeScope, {
				onSome: (scope) => Scope.close(scope, Exit.void),
				onNone: () => Effect.void,
			})
		})

	const attach = <E>(connection: Connection<E>, parent: Scope.Closeable): Effect.Effect<void, E> =>
		Effect.gen(function* () {
			if (Option.isSome(connection.maybeScope)) return
			const scope = yield* Scope.fork(parent)
			connection.maybeScope = Option.some(scope)
			yield* Scope.addFinalizer(
				scope,
				Effect.sync(function () {
					if (Option.isSome(connection.maybeScope) && connection.maybeScope.value === scope) {
						connection.maybeScope = Option.none()
					}
				})
			)
			yield* connection.connect.pipe(
				Scope.provide(scope),
				Effect.onError((cause) => Scope.close(scope, Exit.failCause(cause)))
			)
		})

	const onActivate = <E>(connect: Effect.Effect<void, E, Scope.Scope>): Effect.Effect<Effect.Effect<void>, E> =>
		Effect.gen(function* () {
			const connection: Connection<E> = { connect, maybeScope: Option.none() }
			yield* Effect.gen(function* () {
				connections.add(connection)
				if (Option.isSome(maybeActive)) yield* attach(connection, maybeActive.value.scope)
			}).pipe(Effect.onError(() => release(connection)))
			return release(connection)
		})

	function notifyListeners(): void {
		for (const listener of listeners) listener()
	}

	const deactivate = (scope: Scope.Closeable): Effect.Effect<void> =>
		Effect.suspend(function () {
			if (Option.isSome(maybeActive) && maybeActive.value.scope === scope) {
				inactiveModel = maybeActive.value.store.getModel()
				maybeActive = Option.none()
			}
			return Scope.close(scope, Exit.void)
		})

	const activate = Effect.gen(function* () {
		if (Option.isSome(maybeActive)) return yield* Effect.die(new Error("react-foldkit store is already active"))
		const scope = yield* Scope.make()
		return yield* Effect.gen(function* () {
			const activationModel = inactiveModel
			const commands = Array.filterMap(initCommandStates, (state) =>
				state.isComplete ? Result.failVoid : Result.succeed(trackCompletion(state))
			)
			const store = yield* Effect.acquireRelease(
				Effect.sync(() => Store.boot(config, { model: activationModel, commands })),
				(store) => Effect.sync(store.dispose)
			)
			yield* Effect.acquireRelease(
				Effect.sync(() => store.subscribe(notifyListeners)),
				(unsubscribe) => Effect.sync(unsubscribe)
			)
			maybeActive = Option.some({ store, scope })
			if (store.getModel() !== activationModel) notifyListeners()
			for (const connection of connections) yield* attach(connection, scope)
			return deactivate(scope)
		}).pipe(
			Scope.provide(scope),
			Effect.onError(() => deactivate(scope))
		)
	})

	return {
		[ReactStoreTypeId]: ReactStoreTypeId,
		getModel: () => (Option.isNone(maybeActive) ? inactiveModel : maybeActive.value.store.getModel()),
		getServerModel: () => serverModel,
		subscribe(listener) {
			listeners.add(listener)
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
		onActivate,
		activate,
	}
}
