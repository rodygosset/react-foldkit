import type { Schema } from "effect"
import type * as ManagedResource from "foldkit/managedResource"
import type * as Subscription from "foldkit/subscription"
import type * as Update from "foldkit/update"

type Tagged = { readonly _tag: string }

/**
 * A Foldkit application or child feature without its view: the Model Schema, Message union,
 * update, and optionally an OutMessage union, `init`, Subscriptions, and Managed Resources.
 * The field names match Foldkit's `Runtime.makeApplication`.
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
 * `R` is the services that Commands and Subscriptions require. Registered Managed Resources
 * supply their own services. The host supplies the remaining services through `resources`.
 * An application Program has no OutMessage, so its update returns `Update.Return`.
 *
 * @see {@link make} for creating one with checked types
 * @category models
 * @since 0.2.0
 */
export interface Program<
	ModelSchema extends Schema.Constraint,
	MessageSchema extends Schema.Schema<Tagged>,
	OutMessage = never,
	R = never,
	Managed extends ManagedResource.ManagedResources<ModelSchema["Type"], MessageSchema["Type"]> = {},
> {
	/**
	 * Supplies the Model type. `Application.define` also checks initial Models against it.
	 */
	readonly Model: ModelSchema
	/**
	 * The Schema of the Messages update handles. Every Message has a string `_tag`.
	 * Use `defineMessageUnion` to define the variants and their constructors.
	 */
	readonly Message: MessageSchema
	/**
	 * The union of facts a child reports to its parent. Omit it for an application.
	 */
	readonly OutMessage?: Schema.Schema<OutMessage>
	/**
	 * Creates the initial Model and Commands. A child Program usually omits it, because its
	 * parent creates the child Model.
	 */
	readonly init?: () => Update.Return<ModelSchema["Type"], MessageSchema["Type"], R>
	/**
	 * Applies a Message to the Model without running side effects. Return Commands for work that
	 * runs after the transition.
	 */
	readonly update: (
		model: ModelSchema["Type"],
		message: MessageSchema["Type"]
	) => Update.ReturnWithOutMessage<ModelSchema["Type"], MessageSchema["Type"], OutMessage, R>
	/**
	 * Declares Streams whose dependencies are derived from the Model. Changed dependencies
	 * restart their Streams.
	 */
	readonly subscriptions?: Subscription.Subscriptions<ModelSchema["Type"], MessageSchema["Type"], R>
	/**
	 * Resources whose lifetime follows the Model. Declare them with Foldkit's `ManagedResource.make`.
	 * The host supplies their services to Commands and Subscriptions and releases them on shutdown.
	 * Lift a child's resources into the parent Program with `ManagedResource.lift`.
	 */
	readonly managedResources?: Managed
}

// An application Program reports no OutMessages, so OutMessage stays `never` rather than
// being inferred from update's optional `outMessage` field.
type ApplicationProgram<
	ModelSchema extends Schema.Constraint,
	MessageSchema extends Schema.Schema<Tagged>,
	R,
	Managed extends ManagedResource.ManagedResources<ModelSchema["Type"], MessageSchema["Type"]>,
> = Omit<Program<ModelSchema, MessageSchema, never, R, Managed>, "OutMessage" | "update"> & {
	readonly OutMessage?: undefined
	readonly update: (
		model: ModelSchema["Type"],
		message: MessageSchema["Type"]
	) => Update.Return<ModelSchema["Type"], MessageSchema["Type"], R>
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
export function make<
	ModelSchema extends Schema.Constraint,
	MessageSchema extends Schema.Schema<Tagged>,
	OutMessage,
	R = never,
	Managed extends ManagedResource.ManagedResources<ModelSchema["Type"], MessageSchema["Type"]> = {},
>(
	program: Program<ModelSchema, MessageSchema, OutMessage, R, Managed> & {
		readonly OutMessage: Schema.Schema<OutMessage>
	}
): Program<ModelSchema, MessageSchema, OutMessage, R, Managed>
export function make<
	ModelSchema extends Schema.Constraint,
	MessageSchema extends Schema.Schema<Tagged>,
	R = never,
	Managed extends ManagedResource.ManagedResources<ModelSchema["Type"], MessageSchema["Type"]> = {},
>(
	program: ApplicationProgram<ModelSchema, MessageSchema, R, Managed> & {
		readonly init: () => Update.Return<ModelSchema["Type"], MessageSchema["Type"], R>
	}
): Program<ModelSchema, MessageSchema, never, R, Managed> & {
	readonly init: () => Update.Return<ModelSchema["Type"], MessageSchema["Type"], R>
}
export function make<
	ModelSchema extends Schema.Constraint,
	MessageSchema extends Schema.Schema<Tagged>,
	R = never,
	Managed extends ManagedResource.ManagedResources<ModelSchema["Type"], MessageSchema["Type"]> = {},
>(
	program: ApplicationProgram<ModelSchema, MessageSchema, R, Managed>
): Program<ModelSchema, MessageSchema, never, R, Managed>
// eslint-disable-next-line foldkit-style/prefer-arrow-for-expression-return -- Overloads keep a required init and a `never` OutMessage.
export function make<
	ModelSchema extends Schema.Constraint,
	MessageSchema extends Schema.Schema<Tagged>,
	OutMessage,
	R,
	Managed extends ManagedResource.ManagedResources<ModelSchema["Type"], MessageSchema["Type"]>,
>(
	program: Program<ModelSchema, MessageSchema, OutMessage, R, Managed>
): Program<ModelSchema, MessageSchema, OutMessage, R, Managed> {
	return program
}
