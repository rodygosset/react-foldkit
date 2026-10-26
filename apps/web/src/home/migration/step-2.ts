import { Context, Effect, Layer, Schema } from "effect"
import * as Command from "foldkit/command"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"
import type * as Update from "foldkit/update"
import * as Program from "react-foldkit/program"

export class CartApi extends Context.Service<
	CartApi,
	{ readonly save: (items: ReadonlyArray<string>) => Effect.Effect<void> }
>()("CartApi") {
	static readonly layer = Layer.succeed(this, { save: () => Effect.void })
}

export const Model = Schema.Struct({ items: Schema.Array(Schema.String) })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({ ClickedAdd: { item: Schema.String }, SavedCart: {} })
export type Message = typeof Message.Type

// #region snippet
// Saving used to live in a useEffect. Now update returns a Command.
const SaveCart = Command.define("SaveCart", {
	args: { items: Schema.Array(Schema.String) },
	messages: [Message.SavedCart],
	execute: ({ items }) =>
		Effect.gen(function* () {
			const api = yield* CartApi
			yield* api.save(items)
			return Message.SavedCart()
		}),
})

const update = (model: Model, message: Message) =>
	Message.match<Update.Return<Model, Message, CartApi>>(message, {
		ClickedAdd({ item }) {
			const items = [...model.items, item]
			return {
				model: modifyFields(model, { items: () => items }),
				commands: [SaveCart({ items })],
			}
		},
		SavedCart: () => ({ model }),
	})
// #endregion snippet

const init = () => ({ model: { items: [] } })

export const cart = Program.make({ Model, Message, init, update })
