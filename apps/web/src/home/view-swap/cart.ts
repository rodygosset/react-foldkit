import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"
import type * as Update from "foldkit/update"
import * as Program from "react-foldkit/program"

export const Model = Schema.Struct({ items: Schema.Array(Schema.String) })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({ ClickedAdd: { item: Schema.String } })
export type Message = typeof Message.Type

const update = (model: Model, message: Message) =>
	Message.match<Update.Return<Model, Message>>(message, {
		ClickedAdd: ({ item }) => ({
			model: modifyFields(model, { items: (items) => [...items, item] }),
		}),
	})

const init = () => ({ model: { items: [] } })

/** The Program both views run. It is the same object before and after the move. */
export const cart = Program.make({ Model, Message, init, update })
