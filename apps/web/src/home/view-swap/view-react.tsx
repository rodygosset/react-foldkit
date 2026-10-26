import * as Application from "react-foldkit/application"
import { cart } from "./cart"

const Cart = Application.define(cart)

// #region snippet
function CartButton() {
	const count = Cart.useModel((model) => model.items.length)
	const send = Cart.useSend()

	return (
		<button onClick={() => send.ClickedAdd({ item: "Socks" })}>
			Cart ({count})
		</button>
	)
}
// #endregion snippet

export function CartFeature() {
	return (
		<Cart.Provider>
			<CartButton />
		</Cart.Provider>
	)
}
