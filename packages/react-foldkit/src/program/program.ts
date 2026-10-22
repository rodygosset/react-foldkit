import type { Schema } from "effect"
import type * as Subscription from "foldkit/subscription"
import type * as Update from "foldkit/update"

/**
 * A Foldkit application or child feature without its view: the Model Schema, Message union,
 * update, and optionally an OutMessage union, `init`, and Subscriptions. The field names match
 * Foldkit's `Runtime.makeApplication`.
 *
 * **When to use**
 *
 * Use a Program to keep a feature's logic in a module without React. Pass an application
 * Program to `Application.define`, with React-only options and `resources` as its second
 * argument. Pass a child Program to `Submodel.define`, run `update` in Foldkit Story tests, or
 * pass the Program to `Store.make` and `Store.boot`.
 *
 * **Details**
 *
 * `R` is the services that Commands and Subscriptions require. A Program does not provide
 * them: the host that runs it supplies `resources`. An application Program has no
 * OutMessage, so its update returns `Update.Return`.
 *
 * @see {@link make} for creating one with checked types
 * @category models
 * @since 0.2.0
 */
export interface Program<Model, Message, OutMessage = never, R = never> {
	/**
	 * Supplies the Model type. `Application.define` also checks initial Models against it.
	 */
	readonly Model: Schema.Codec<Model, unknown, unknown, unknown>
	/**
	 * The Schema of the Messages update handles. Every Message has a string `_tag`.
	 * Use `defineMessageUnion` to define the variants and their constructors.
	 */
	readonly Message: Schema.Schema<Message>
	/**
	 * The union of facts a child reports to its parent. Omit it for an application.
	 */
	readonly OutMessage?: Schema.Schema<OutMessage>
	/**
	 * Creates the initial Model and Commands. A child Program usually omits it, because its
	 * parent creates the child Model.
	 */
	readonly init?: () => Update.Return<Model, Message, R>
	/**
	 * Applies a Message to the Model without running side effects. Return Commands for work that
	 * runs after the transition.
	 */
	readonly update: (model: Model, message: Message) => Update.ReturnWithOutMessage<Model, Message, OutMessage, R>
	/**
	 * Declares Streams whose dependencies are derived from the Model. Changed dependencies
	 * restart their Streams.
	 */
	readonly subscriptions?: Subscription.Subscriptions<Model, Message, R>
}

// An application Program reports no OutMessages, so OutMessage stays `never` rather than
// being inferred from update's optional `outMessage` field.
type ApplicationProgram<Model, Message, R> = Omit<Program<Model, Message, never, R>, "OutMessage" | "update"> & {
	readonly OutMessage?: undefined
	readonly update: (model: Model, message: Message) => Update.Return<Model, Message, R>
}

/**
 * Creates a Program from a Model Schema, a Message union, and Foldkit's `update` and `init`
 * functions. It checks that every part agrees on the Model and Message types and returns its
 * argument unchanged.
 *
 * **Details**
 *
 * When the Program has an `init`, the result keeps it as required, so the Provider of an
 * application built from it needs no `init` prop.
 *
 * **Example** (Sharing a counter Program between React and tests)
 *
 * ```ts
 * import { Schema } from "effect"
 * import { defineMessageUnion } from "foldkit/message"
 * import { modifyFields } from "foldkit/struct"
 * import type * as Update from "foldkit/update"
 * import * as Program from "react-foldkit/program"
 *
 * const Model = Schema.Struct({ count: Schema.Finite })
 * type Model = typeof Model.Type
 *
 * const Message = defineMessageUnion({ ClickedIncrement: {} })
 * type Message = typeof Message.Type
 *
 * const init = (): Update.Return<Model, Message> => ({ model: { count: 0 } })
 *
 * const update = (model: Model, message: Message) =>
 * 	Message.match<Update.Return<Model, Message>>(message, {
 * 		ClickedIncrement: () => ({ model: modifyFields(model, { count: (count) => count + 1 }) }),
 * 	})
 *
 * export const counter = Program.make({ Model, Message, init, update })
 * ```
 *
 * @category constructors
 * @since 0.2.0
 */
export function make<Model, Message extends { readonly _tag: string }, OutMessage, R = never>(
	program: Program<Model, Message, OutMessage, R> & { readonly OutMessage: Schema.Schema<OutMessage> }
): Program<Model, Message, OutMessage, R>
export function make<Model, Message extends { readonly _tag: string }, R = never>(
	program: ApplicationProgram<Model, Message, R> & { readonly init: () => Update.Return<Model, Message, R> }
): Program<Model, Message, never, R> & { readonly init: () => Update.Return<Model, Message, R> }
export function make<Model, Message extends { readonly _tag: string }, R = never>(
	program: ApplicationProgram<Model, Message, R>
): Program<Model, Message, never, R>
// eslint-disable-next-line foldkit-style/prefer-arrow-for-expression-return -- Overloads keep a required init and a `never` OutMessage.
export function make<Model, Message extends { readonly _tag: string }, OutMessage, R>(
	program: Program<Model, Message, OutMessage, R>
): Program<Model, Message, OutMessage, R> {
	return program
}
