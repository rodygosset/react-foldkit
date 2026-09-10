import { Predicate } from "effect"
import * as Store from "../store"
import type * as Update from "../update"
import * as InitCommand from "./init-command"

const ReactStoreTypeId: unique symbol = Symbol.for("react-foldkit/ReactStoreTypeId")
export type ReactStoreTypeId = typeof ReactStoreTypeId

/** Private. Only {@link Seed} in `react.tsx` may call this. */
const SeedModelSymbol: unique symbol = Symbol.for("react-foldkit/ReactStore/SeedModel")
type SeedModelSymbol = typeof SeedModelSymbol

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

type ReactStoreWithSeed<Model, Message> = ReactStore<Model, Message> & {
	readonly [SeedModelSymbol]: (model: Model) => void
}

const trackCompletion = <Message, R>(state: InitCommandState<Message, R>): InitCommand<Message, R> =>
	InitCommand.track(state.command, function markComplete() {
		state.isComplete = true
	})

export const seedModel = <Model, Message>(store: ReactStore<Model, Message>, model: Model): void => {
	if (Predicate.hasProperty(store, SeedModelSymbol)) {
		;(store[SeedModelSymbol] as (model: Model) => void)(model)
		return
	}
	throw new Error("seedModel property not found on store")
}

export function make<Model, Message, R = never>(
	config: Store.Config<Model, Message, R>,
	init: Update.Return<Model, Message, R>
): ReactStore<Model, Message> {
	const listeners = new Set<() => void>()
	const initCommands = init.commands ?? []
	const initCommandStates = initCommands.map(function (command) {
		return { command, isComplete: false }
	})
	let inactiveModel = init.model
	let serverModel = inactiveModel
	let activeStore: Store.Store<Model, Message> | null = null

	function notifyListeners(): void {
		for (const listener of listeners) listener()
	}

	function seed(model: Model): void {
		if (activeStore !== null) throw new Error("react-foldkit <Seed> cannot run after the store is active")
		inactiveModel = model
		serverModel = model
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

	const store: ReactStoreWithSeed<Model, Message> = {
		[ReactStoreTypeId]: ReactStoreTypeId,
		[SeedModelSymbol]: seed,
		getModel: () => (activeStore === null ? inactiveModel : activeStore.getModel()),
		getServerModel: () => serverModel,
		subscribe(listener) {
			listeners.add(listener)
			return () => listeners.delete(listener)
		},
		dispatch(message) {
			if (activeStore !== null) activeStore.dispatch(message)
		},
		activate,
	}

	return store
}
