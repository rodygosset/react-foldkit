import { Option } from "effect"

/**
 * Read-only external-store contract consumed by React Model hooks. Implement it to supply
 * cached live and hydration snapshots without exposing Message dispatch.
 *
 * Live and server snapshots must retain their identity until their data changes.
 *
 * @category models
 * @since 0.1.0
 */
export interface ModelReader<Model> {
	/**
	 * Reads the current cached Model without acquiring resources or notifying observers.
	 */
	readonly getSnapshot: () => Model
	/**
	 * Reads the Model used during server rendering and hydration.
	 */
	readonly getServerSnapshot: () => Model
	/**
	 * Registers synchronous invalidation and returns cleanup. Notifications tell React to read
	 * the snapshot again.
	 */
	readonly subscribe: (notify: () => void) => () => void
}

/**
 * Model snapshots and a dispatcher to their owner. Use this contract to let views read a
 * Model and send Messages without depending on the Store implementation.
 *
 * @category models
 * @since 0.1.0
 */
export interface ModelSource<Model, Message> extends ModelReader<Model> {
	/**
	 * Sends a Message to the owner of these snapshots.
	 */
	readonly dispatch: (message: Message) => void
}

export function stabilize<Model, Wrapped>(wrap: (model: Model) => Wrapped, read: () => Model): () => Wrapped {
	let previous: Option.Option<readonly [Model, Wrapped]> = Option.none()
	return function () {
		const model = read()
		if (Option.isSome(previous) && Object.is(previous.value[0], model)) return previous.value[1]
		const wrapped = wrap(model)
		previous = Option.some([model, wrapped] as const)
		return wrapped
	}
}

