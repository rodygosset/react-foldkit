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
				products.map((product) =>
					h.li(
						[h.Key(product.name)],
						[
							h.span([], [product.name]),
							h.span([], [`€${product.price}`]),
							h.button(
								[
									h.AriaLabel(`Add ${product.name}`),
									h.OnClick(Message.ClickedAdd({ item: product.name })),
								],
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
							h.Disabled(model.status === "saving" || model.items.length === 0),
							h.OnClick(Message.ClickedSave()),
						],
						[saveLabel(model.status)]
					),
				]
			),
		]
	)
// #endregion snippet
