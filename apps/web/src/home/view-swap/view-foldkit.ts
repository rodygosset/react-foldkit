import { Runtime } from "foldkit"
import type { Html, HtmlBuilder } from "foldkit/html"
import { Message, cart } from "./cart"
import type { Model } from "./cart"

// #region snippet
const view = (model: Model, h: HtmlBuilder<Message>): Html =>
	h.button(
		[h.OnClick(Message.ClickedAdd({ item: "Socks" }))],
		[`Cart (${model.items.length})`]
	)

export const mountCart = (container: HTMLElement) =>
	Runtime.run(
		Runtime.makeElement({ ...cart, view, container })
	)
// #endregion snippet
