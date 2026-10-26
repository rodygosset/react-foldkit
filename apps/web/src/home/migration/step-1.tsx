import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"
import type * as Update from "foldkit/update"
import * as Application from "react-foldkit/application"
import * as Program from "react-foldkit/program"

// #region snippet
const Model = Schema.Struct({ items: Schema.Array(Schema.String) })
type Model = typeof Model.Type

const Message = defineMessageUnion({ ClickedAdd: { item: Schema.String } })
type Message = typeof Message.Type

const update = (model: Model, message: Message) =>
	Message.match<Update.Return<Model, Message>>(message, {
		ClickedAdd: ({ item }) => ({
			model: modifyFields(model, { items: (items) => [...items, item] }),
		}),
	})

const init = () => ({ model: { items: [] } })
const cart = Program.make({ Model, Message, init, update })
const Cart = Application.define(cart)

// The React component stays. It reads the Model instead of useState.
function AddToCart() {
	const count = Cart.useModel((model) => model.items.length)
	const send = Cart.useSend()

	return (
		<button onClick={() => send.ClickedAdd({ item: "Socks" })}>
			Cart ({count})
		</button>
	)
}

export function CartFeature() {
	return (
		<Cart.Provider>
			<AddToCart />
		</Cart.Provider>
	)
}
// #endregion snippet
