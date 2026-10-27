import { Array } from "effect"
import type { Html, HtmlBuilder } from "foldkit/html"
import { Message, products, saveLabel, totalOf } from "./program"
import type { Model } from "./program"

// #region snippet
export const view = (model: Model, h: HtmlBuilder<Message>): Html =>
	h.section(
		[h.Class("shop")],
		[
			h.ul(
				[],
				Array.map(products, (product) =>
					h.keyed("li")(
						product.name,
						[],
						[
							h.span([], [product.name]),
							h.span([], [`€${product.price}`]),
							h.button(
								[h.AriaLabel(`Add ${product.name}`), h.OnClick(Message.ClickedAdd({ product }))],
								["Add"]
							),
						]
					)
				)
			),
			h.footer(
				[],
				[
					h.p([], [`${model.items.length} in cart · €${totalOf(model.items)}`]),
					h.button(
						[
							h.Disabled(model.status === "Saving" || Array.isReadonlyArrayEmpty(model.items)),
							h.OnClick(Message.ClickedSave()),
						],
						[saveLabel(model.status)]
					),
				]
			),
		]
	)
// #endregion snippet
