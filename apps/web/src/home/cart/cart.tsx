import * as Application from "react-foldkit/application"
import { SaveCart, cart, products, saveLabel, totalOf } from "./program"

export const Cart = Application.define(cart, {
	restartInterrupted: (command) => command.name === SaveCart.name,
})

// #region snippet
export function CartView() {
	const items = Cart.useModel((model) => model.items)
	const status = Cart.useModel((model) => model.status)
	const send = Cart.useSend()

	return (
		<section className="shop">
			<ul>
				{products.map((product) => (
					<li key={product.name}>
						<span>{product.name}</span>
						<span>€{product.price}</span>
						<button
							aria-label={`Add ${product.name}`}
							onClick={() => send.ClickedAdd({ product })}
						>
							Add
						</button>
					</li>
				))}
			</ul>
			<footer>
				<p>
					{items.length} in cart · €{totalOf(items)}
				</p>
				<button
					disabled={status === "Saving" || items.length === 0}
					onClick={() => send.ClickedSave()}
				>
					{saveLabel(status)}
				</button>
			</footer>
		</section>
	)
}
// #endregion snippet
