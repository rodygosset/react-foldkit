import { Option } from "effect"
import * as Update from "foldkit/update"
import { stabilize, type ModelReader, type ModelSource } from "../modelSource/modelSource"

/**
 * How a child Provider or `useSubmodel` reads a child that is always present in a parent Model
 * and routes its Messages back. A `Lift` is one; a plain object with the same two fields works
 * for any other read.
 *
 * @category models
 * @since 0.1.0
 */
export interface Projection<ParentModel, ParentMessage, Model, Message> {
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
 * A child stored in one field of its parent Model, described once for both halves of the
 * Submodel. Pass it to a Submodel Provider or `useSubmodel`, and call `fold` from the parent
 * update to run the child update and write the result back.
 *
 * @category models
 * @since 0.1.0
 */
export interface Lift<ParentModel, ParentMessage, Model, Message, FoldResult>
	extends Projection<ParentModel, ParentMessage, Model, Message> {
	/**
	 * The parent field that holds the child Model.
	 */
	readonly key: string
	/**
	 * Replaces the child Model, returning the same parent when the child is unchanged.
	 */
	readonly write: (model: ParentModel, child: Model) => ParentModel
	/**
	 * Runs the child update and folds its Model, Commands, and OutMessage into the parent.
	 * Call as `fold(model, message)` or `fold(message)` for a Step.
	 */
	readonly fold: FoldResult
}

type LiftUpdate<Model, Message, R> = (model: Model, message: Message) => Update.Return<Model, Message, R>

type LiftUpdateWithOutMessage<Model, Message, OutMessage, R> = (
	model: Model,
	message: Message
) => Update.ReturnWithOutMessage<Model, Message, OutMessage, R>

/**
 * Lifts a child stored in one field of the parent Model. The result reads and writes that
 * field, lifts child Messages, and folds the child update, so the view and update halves share
 * one declaration. Supply the parent Model type first.
 *
 * **Example** (Embedding a form in a parent Model)
 *
 * ```ts
 * // form.ts owns the child Model, Message, and update.
 * import { Schema } from "effect"
 * import { defineMessageUnion } from "foldkit/message"
 * import { modifyFields } from "foldkit/struct"
 *
 * export const Model = Schema.Struct({ draft: Schema.String })
 * export type Model = typeof Model.Type
 *
 * export const Message = defineMessageUnion({ ChangedDraft: { text: Schema.String } })
 * export type Message = typeof Message.Type
 *
 * export const update = (model: Model, message: Message) => ({
 * 	model: modifyFields(model, { draft: () => message.text }),
 * })
 *
 * // app.ts embeds the form and folds its Messages.
 * import * as Form from "./form"
 * import { Schema } from "effect"
 * import { defineMessageUnion } from "foldkit/message"
 * import * as Submodel from "react-foldkit/submodel"
 *
 * const Model = Schema.Struct({ form: Form.Model })
 * type Model = typeof Model.Type
 *
 * const Message = defineMessageUnion({ GotFormMessage: { message: Form.Message } })
 * type Message = typeof Message.Type
 *
 * export const form = Submodel.lift<Model>()("form", {
 * 	update: Form.update,
 * 	toParentMessage: (message: Form.Message) => Message.GotFormMessage({ message }),
 * })
 *
 * export const update = (model: Model, message: Message) =>
 * 	Message.match(message, { GotFormMessage: ({ message }) => form.fold(model, message) })
 * ```
 *
 * @category constructors
 * @since 0.1.0
 */
export function lift<ParentModel>() {
	function build<
		K extends keyof ParentModel & string,
		ParentMessage,
		Message,
		OutMessage,
		R = never,
		StepR = R,
		StepMessage = ParentMessage,
	>(
		key: K,
		options: {
			readonly update: LiftUpdateWithOutMessage<ParentModel[K], Message, OutMessage, R>
			readonly toParentMessage: (message: Message) => ParentMessage
			readonly foldOutMessage: (
				outMessage: OutMessage,
				context: Update.FoldContext<Message, ParentMessage>
			) => Update.Step<NoInfer<ParentModel>, StepMessage, StepR>
		}
	): Lift<
		ParentModel,
		ParentMessage,
		ParentModel[K],
		Message,
		Update.Fold<ParentModel, ParentMessage | StepMessage, Message, R | StepR>
	>
	function build<K extends keyof ParentModel & string, ParentMessage, Message, R = never>(
		key: K,
		options: {
			readonly update: LiftUpdate<ParentModel[K], Message, R>
			readonly toParentMessage: (message: Message) => ParentMessage
		}
	): Lift<ParentModel, ParentMessage, ParentModel[K], Message, Update.Fold<ParentModel, ParentMessage, Message, R>>
	// eslint-disable-next-line foldkit-style/prefer-arrow-for-expression-return -- Overloads describe each foldChild shape.
	function build(key: string, options: AnyLiftOptions): unknown {
		return makeLift(key, options)
	}
	return build
}

type AnyLiftOptions = {
	readonly update: (model: never, message: never) => unknown
	readonly toParentMessage: (message: never) => unknown
	readonly foldOutMessage?: (outMessage: never, context: never) => unknown
}

function makeLift(key: string, options: AnyLiftOptions) {
	type Parent = Readonly<Record<string, unknown>>
	const read = (model: Parent) => model[key]
	const write = (model: Parent, child: unknown): Parent =>
		Object.is(model[key], child) ? model : { ...model, [key]: child }
	// foldChild picks its OutMessage behavior from the presence of foldOutMessage.
	const fold = Update.foldChild({
		...options,
		read: (model: Parent) => Option.some(read(model)),
		write,
	} as Parameters<typeof Update.foldChild>[0])
	return { key, read, write, toParentMessage: options.toParentMessage, fold }
}

/**
 * How `useOptionalSubmodel` reads a child that may be absent from a parent Model, exposing a
 * child source while the child exists.
 *
 * @category models
 * @since 0.1.0
 */
export interface OptionalProjection<ParentModel, ParentMessage, Model, Message> {
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
	{ read, toParentMessage }: Projection<ParentModel, ParentMessage, Model, Message>
): ModelSource<Model, Message> => ({
	getSnapshot: stabilize(read, () => parent.getSnapshot()),
	getServerSnapshot: stabilize(read, () => parent.getServerSnapshot()),
	subscribe: (notify) => parent.subscribe(notify),
	dispatch: (message) => parent.dispatch(toParentMessage(message)),
})

export interface OptionalProjectionResult<Model, Message> {
	readonly source: () => Option.Option<ModelSource<Model, Message>>
	readonly presence: ModelReader<boolean>
}

export function projectOptional<ParentModel, ParentMessage, Model, Message>(
	parent: ModelSource<ParentModel, ParentMessage>,
	{ read, toParentMessage }: OptionalProjection<ParentModel, ParentMessage, Model, Message>
): OptionalProjectionResult<Model, Message> {
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
