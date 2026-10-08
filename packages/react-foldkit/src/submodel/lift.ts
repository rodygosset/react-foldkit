import { Option } from "effect"
import { stabilize, type ModelReader, type ModelSource } from "../modelSource/modelSource"

/**
 * Description of a child that is always present in a parent Model. Use it with
 * `useSubmodel` to derive the child's source and route its Messages to the parent.
 *
 * @category models
 * @since 0.1.0
 */
export interface Lift<ParentModel, ParentMessage, Model, Message> {
	/**
	 * Projects a child Model. Keep this function pure and its declaration stable across renders.
	 */
	readonly read: (model: ParentModel) => Model
	/**
	 * Converts a child Message into the Message handled by the parent update.
	 */
	readonly toParentMessage: (message: Message) => ParentMessage
}

/**
 * Declares a child Model read and Message lift while preserving their inferred types.
 *
 * In real code the child owns canonical `Model` and `Message` names in its own module,
 * imported below as `Counter`.
 *
 * **Example** (Reading a child and lifting its Message)
 *
 * ```ts
 * // counter.ts owns the child Model and Message.
 * import { Schema } from "effect"
 * import { defineMessageUnion } from "react-foldkit/message"
 *
 * export const Model = Schema.Struct({ count: Schema.Finite })
 * export type Model = typeof Model.Type
 *
 * export const Message = defineMessageUnion({ Incremented: {} })
 * export type Message = typeof Message.Type
 *
 * // app.ts lifts counter messages into its own Message.
 * import * as Counter from "./counter"
 * import { Schema } from "effect"
 * import { defineMessageUnion } from "react-foldkit/message"
 * import * as Submodel from "react-foldkit/submodel"
 *
 * const Model = Schema.Struct({ counter: Counter.Model })
 * type Model = typeof Model.Type
 *
 * const Message = defineMessageUnion({ GotCounterMessage: { message: Counter.Message } })
 *
 * export const counter = Submodel.lift({
 * 	read: (model: Model) => model.counter,
 * 	toParentMessage: (message: Counter.Message) => Message.GotCounterMessage({ message }),
 * })
 * ```
 *
 * @category constructors
 * @since 0.1.0
 */
export const lift = <ParentModel, ParentMessage, Model, Message>(
	input: Lift<ParentModel, ParentMessage, Model, Message>
): Lift<ParentModel, ParentMessage, Model, Message> => input

/**
 * Description of a child that may be absent from a parent Model. Use it with
 * `useOptionalSubmodel` to expose a child source while the child exists.
 *
 * @category models
 * @since 0.1.0
 */
export interface OptionalLift<ParentModel, ParentMessage, Model, Message> {
	/**
	 * Returns the current child Model or `None`. Keep this function pure and stable across renders.
	 */
	readonly read: (model: ParentModel) => Option.Option<Model>
	/**
	 * Converts a child Message into the Message handled by the parent update.
	 */
	readonly toParentMessage: (message: Message) => ParentMessage
}

export const project = <ParentModel, ParentMessage, Model, Message>(
	parent: ModelSource<ParentModel, ParentMessage>,
	{ read, toParentMessage }: Lift<ParentModel, ParentMessage, Model, Message>
): ModelSource<Model, Message> => ({
	getSnapshot: stabilize(read, () => parent.getSnapshot()),
	getServerSnapshot: stabilize(read, () => parent.getServerSnapshot()),
	subscribe: (notify) => parent.subscribe(notify),
	dispatch: (message) => parent.dispatch(toParentMessage(message)),
})

export interface OptionalLiftResult<Model, Message> {
	readonly source: () => Option.Option<ModelSource<Model, Message>>
	readonly presence: ModelReader<boolean>
}

export function projectOptional<ParentModel, ParentMessage, Model, Message>(
	parent: ModelSource<ParentModel, ParentMessage>,
	{ read, toParentMessage }: OptionalLift<ParentModel, ParentMessage, Model, Message>
): OptionalLiftResult<Model, Message> {
	const current = stabilize(read, () => parent.getSnapshot())
	const server = stabilize(read, () => parent.getServerSnapshot())
	function retain(getModel: () => Option.Option<Model>, initial: Model) {
		let last = initial
		return function () {
			const model = getModel()
			if (Option.isSome(model)) last = model.value
			return last
		}
	}
	let source: Option.Option<ModelSource<Model, Message>> = Option.none()
	function getSource(): Option.Option<ModelSource<Model, Message>> {
		if (Option.isSome(source)) return source
		const live = current()
		const hydration = server()
		const initial = Option.orElse(live, () => hydration)
		if (Option.isNone(initial)) return source
		source = Option.some({
			getSnapshot: retain(
				current,
				Option.getOrElse(live, () => initial.value)
			),
			getServerSnapshot: retain(
				server,
				Option.getOrElse(hydration, () => initial.value)
			),
			subscribe: (notify) => parent.subscribe(notify),
			dispatch: (message) => parent.dispatch(toParentMessage(message)),
		})
		return source
	}
	const presence: ModelReader<boolean> = {
		getSnapshot: () => Option.isSome(current()),
		getServerSnapshot: () => Option.isSome(server()),
		subscribe: (notify) => parent.subscribe(notify),
	}
	return { source: getSource, presence }
}
