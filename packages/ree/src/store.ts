import { Effect, type Layer } from "effect"
import type * as Update from "./update"

/** Program definition: update + services. Init is supplied later via {@link boot}. */
export type Config<Model, Message, R = never> = {
	update: (model: Model, message: Message) => Update.Return<Model, Message, R>
	/** Services provided to every Command Effect (Foldkit-style Resources). */
	layer?: Layer.Layer<R, never, never>
}

export const StoreTypeId: unique symbol = Symbol("ree/StoreTypeId")
export type StoreTypeId = typeof StoreTypeId

export type Store<Model, Message> = {
	readonly [StoreTypeId]: StoreTypeId
	getModel: () => Model
	subscribe: (listener: () => void) => () => void
	dispatch: (message: Message) => void
	dispose: () => void
}

/**
 * Starts a live store from a config and an init return. Runs init Commands
 * asynchronously. Call from the React Provider (or tests), not at module load,
 * so Flags like URL search can be read first.
 */
export function boot<Model, Message, R = never>(
	config: Config<Model, Message, R>,
	init: Update.Return<Model, Message, R>
): Store<Model, Message> {
	const listeners = new Set<() => void>()
	const queue: Array<Message> = []
	let draining = false
	let disposed = false

	const [initialModel, initCommands] = init
	let model: Model = initialModel

	function notify(): void {
		for (const listener of listeners) {
			listener()
		}
	}

	function runCommands(commands: Update.Commands<Message, R>): void {
		for (const command of commands) {
			const raw = command.effect as Effect.Effect<Message, unknown, R>
			const effect =
				config.layer === undefined ? (raw as Effect.Effect<Message, unknown, never>) : Effect.provide(raw, config.layer)

			void Effect.runPromise(effect).then(
				function onSuccess(message) {
					dispatch(message)
				},
				function onFailure(cause) {
					if (!disposed) {
						console.error(`[ree] Command "${command._tag}" failed:`, cause)
					}
				}
			)
		}
	}

	function drain(): void {
		if (draining) return

		draining = true
		try {
			while (queue.length > 0) {
				const message = queue.shift()!
				const [nextModel, commands] = config.update(model, message)
				model = nextModel
				notify()
				if (commands.length > 0) {
					runCommands(commands)
				}
			}
		} finally {
			draining = false
		}
	}

	function dispatch(message: Message): void {
		if (disposed) {
			return
		}
		queue.push(message)
		drain()
	}

	function getModel(): Model {
		return model
	}

	function subscribe(listener: () => void): () => void {
		listeners.add(listener)
		return function unsubscribe() {
			listeners.delete(listener)
		}
	}

	function dispose(): void {
		disposed = true
		queue.length = 0
		listeners.clear()
	}

	if (initCommands.length > 0) {
		runCommands(initCommands)
	}

	return { [StoreTypeId]: StoreTypeId, getModel, subscribe, dispatch, dispose }
}
