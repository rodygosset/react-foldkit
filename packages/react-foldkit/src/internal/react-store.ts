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
	activate: () => () => void
}>

const trackCompletion = <Message, R>(state: InitCommandState<Message, R>): InitCommand<Message, R> =>
	InitCommand.track(state.command, function markComplete() {
		state.isComplete = true
	})

/** Wraps an already-live {@link Store.boot} store. Activate does not dispose it. */
export function fromLive<Model, Message>(store: Store.Store<Model, Message>): ReactStore<Model, Message> {
	const serverModel = store.getModel()

	return {
		[ReactStoreTypeId]: ReactStoreTypeId,
		getModel: () => store.getModel(),
		getServerModel: () => serverModel,
		subscribe: store.subscribe,
		dispatch: store.dispatch,
		activate: () => () => undefined,
	}
}

export function make<Model, Message, R = never>(
	config: Store.Config<Model, Message, R>,
	init: Update.Return<Model, Message, R>
): ReactStore<Model, Message> {
	const listeners = new Set<() => void>()
	const initialModel = init.model
	const initCommands = init.commands ?? []
	const initCommandStates = initCommands.map(function (command) {
		return { command, isComplete: false }
	})
	let inactiveModel = initialModel
	let activeStore: Store.Store<Model, Message> | null = null

	function notifyListeners(): void {
		for (const listener of listeners) listener()
	}

	function activate(): () => void {
		if (activeStore !== null) throw new Error("react-foldkit store is already active")

		const activationModel = inactiveModel
		const pendingInitCommands = initCommandStates
			.filter(function (state) {
				return !state.isComplete
			})
			.map(trackCompletion)
		const store = Store.boot(config, { model: activationModel, commands: pendingInitCommands })
		activeStore = store
		const unsubscribe = store.subscribe(notifyListeners)

		if (store.getModel() !== activationModel) notifyListeners()

		let isActive = true
		return function deactivate() {
			if (!isActive) return
			isActive = false
			unsubscribe()
			inactiveModel = store.getModel()
			activeStore = null
			store.dispose()
		}
	}

	return {
		[ReactStoreTypeId]: ReactStoreTypeId,
		getModel: () => (activeStore === null ? inactiveModel : activeStore.getModel()),
		getServerModel: () => initialModel,
		subscribe(listener) {
			listeners.add(listener)
			return () => listeners.delete(listener)
		},
		dispatch(message) {
			if (activeStore !== null) activeStore.dispatch(message)
		},
		activate,
	}
}
