import { Schema } from "effect"
import * as Store from "../store"
import type * as Update from "../update"
import * as InitCommand from "./init-command"

type InitCommand<Message, R> = Update.Commands<Message, R>[number]

type InitCommandState<Message, R> = {
	readonly command: InitCommand<Message, R>
	isComplete: boolean
}

export type ReactStore<ModelSchema extends Schema.Codec<unknown, unknown, never, never>, Message> = {
	getModel: () => Schema.Schema.Type<ModelSchema>
	getServerModel: () => Schema.Schema.Type<ModelSchema>
	subscribe: (listener: () => void) => () => void
	dispatch: (message: Message) => void
	activate: () => () => void
}

const trackCompletion = <Message, R>(state: InitCommandState<Message, R>): InitCommand<Message, R> =>
	InitCommand.track(state.command, function markComplete() {
		state.isComplete = true
	})

export function make<ModelSchema extends Schema.Codec<unknown, unknown, never, never>, Message, R = never>(
	config: Store.Config<ModelSchema, Message, R>,
	init: Update.Return<Schema.Schema.Type<ModelSchema>, Message, R>
): ReactStore<ModelSchema, Message> {
	const listeners = new Set<() => void>()
	const [initialModel, initCommands] = init
	const initCommandStates = initCommands.map(function (command) {
		return { command, isComplete: false }
	})
	let inactiveModel = initialModel
	let activeStore: Store.Store<ModelSchema, Message> | null = null

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
		const store = Store.boot(config, [activationModel, pendingInitCommands])
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
