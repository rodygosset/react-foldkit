import { Effect, Schema } from "effect"
import * as Command from "foldkit/command"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"
import type * as Update from "foldkit/update"
import * as Program from "react-foldkit/program"

export const products = [
	{ name: "Wool socks", price: 12 },
	{ name: "Linen cap", price: 24 },
]

export const Status = Schema.Literals(["unsaved", "saving", "saved"])
export type Status = typeof Status.Type

export const totalOf = (items: ReadonlyArray<string>): number =>
	items.reduce(
		(sum, item) =>
			sum + (products.find((product) => product.name === item)?.price ?? 0),
		0
	)

export const saveLabel = (status: Status): string =>
	status === "saving" ? "Saving..." : status === "saved" ? "Saved" : "Save cart"

// #region snippet
export const Model = Schema.Struct({
	items: Schema.Array(Schema.String),
	status: Status,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
	ClickedAdd: { item: Schema.String },
	ClickedSave: {},
	SavedCart: {},
})
export type Message = typeof Message.Type

// Saving is a side effect, so it runs as a Command.
export const SaveCart = Command.define("SaveCart", {
	args: { items: Schema.Array(Schema.String) },
	messages: [Message.SavedCart],
	execute: ({ items }) =>
		Api.saveCart(items).pipe(Effect.as(Message.SavedCart())),
})

const update = (model: Model, message: Message) =>
	Message.match<Update.Return<Model, Message>>(message, {
		ClickedAdd: ({ item }) => ({
			model: modifyFields(model, {
				items: (items) => [...items, item],
				status: () => "unsaved",
			}),
		}),
		ClickedSave: () => ({
			model: modifyFields(model, { status: () => "saving" }),
			commands: [SaveCart({ items: model.items })],
		}),
		SavedCart: () => ({
			model: modifyFields(model, { status: () => "saved" }),
		}),
	})

export const initialModel: Model = { items: [], status: "unsaved" }

const init = () => ({ model: initialModel })

export const cart = Program.make({ Model, Message, init, update })
// #endregion snippet

/** Stands in for a request to the store's API. */
const Api = {
	saveCart: (_items: ReadonlyArray<string>) => Effect.sleep("900 millis"),
}
