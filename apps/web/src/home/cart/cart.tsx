import * as Application from "react-foldkit/application"
import { cart, products, saveLabel, totalOf } from "./program"

export const Shop = Application.define(cart, {
	restartInterrupted: (command) => command.name === "SaveCart",
})

// #region snippet
export function CartView() {
	const items = Shop.useModel((model) => model.items)
	const status = Shop.useModel((model) => model.status)
	const send = Shop.useSend()

	return (
		<section className="shop">
			<ul>
				{products.map((product) => (
					<li key={product.name}>
						<span>{product.name}</span>
						<span>€{product.price}</span>
						<button
							aria-label={`Add ${product.name}`}
							onClick={() => send.ClickedAdd({ item: product.name })}
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
					disabled={status === "saving" || items.length === 0}
					onClick={() => send.ClickedSave()}
				>
					{saveLabel(status)}
				</button>
			</footer>
		</section>
	)
}
// #endregion snippet
