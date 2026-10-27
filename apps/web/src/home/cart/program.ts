import { Array, Effect, Equal, Match, Number, Schema } from "effect"
import * as Command from "foldkit/command"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"
import type * as Update from "foldkit/update"
import * as Program from "react-foldkit/program"

export const Product = Schema.Struct({ name: Schema.String, price: Schema.Finite })
export type Product = typeof Product.Type

export const products: ReadonlyArray<Product> = [
	{ name: "Wool socks", price: 12 },
	{ name: "Linen cap", price: 24 },
]

export const Status = Schema.Literals(["Unsaved", "Saving", "Saved"])
export type Status = typeof Status.Type

export const totalOf = (items: ReadonlyArray<Product>): number => Number.sumAll(Array.map(items, (item) => item.price))

export const saveLabel = (status: Status): string =>
	Match.value(status).pipe(
		Match.when("Unsaved", () => "Save cart"),
		Match.when("Saving", () => "Saving..."),
		Match.when("Saved", () => "Saved"),
		Match.exhaustive
	)

// #region snippet
export const Model = Schema.Struct({
	items: Schema.Array(Product),
	status: Status,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
	ClickedAdd: { product: Product },
	ClickedSave: {},
	CompletedSaveCart: { items: Schema.Array(Product) },
})
export type Message = typeof Message.Type

// Saving is a side effect, so it runs as a Command.
export const SaveCart = Command.define("SaveCart", {
	args: { items: Schema.Array(Product) },
	messages: [Message.CompletedSaveCart],
	execute: ({ items }) => Api.saveCart(items).pipe(Effect.as(Message.CompletedSaveCart({ items }))),
})

const update = (model: Model, message: Message) =>
	Message.match<Update.Return<Model, Message>>(message, {
		ClickedAdd: ({ product }) => ({
			model: modifyFields(model, {
				items: Array.append(product),
				status: () => "Unsaved",
			}),
		}),
		ClickedSave: () => ({
			model: modifyFields(model, { status: () => "Saving" }),
			commands: [SaveCart({ items: model.items })],
		}),
		// Items added during the save weren't in this request, so the cart stays unsaved.
		CompletedSaveCart: ({ items }) =>
			Equal.equals(items, model.items) ? { model: modifyFields(model, { status: () => "Saved" }) } : { model },
	})

export const initialModel: Model = { items: [], status: "Unsaved" }

const init = () => ({ model: initialModel })

export const cart = Program.make({ Model, Message, init, update })
// #endregion snippet

const saveDelay = "900 millis"

/** Stands in for a request to the store's API. */
const Api = {
	saveCart: (_items: ReadonlyArray<Product>) => Effect.sleep(saveDelay),
}
