import { Runtime } from "foldkit"
import type { Html, HtmlBuilder } from "foldkit/html"
import { CartApi, Message, cart } from "./step-2"
import type { Model } from "./step-2"

// #region snippet
// The Program, its Commands, and its tests stay. Only the view changes.
const view = (model: Model, h: HtmlBuilder<Message>): Html =>
	h.button(
		[h.OnClick(Message.ClickedAdd({ item: "Socks" }))],
		[`Cart (${model.items.length})`]
	)

export const mountCart = (container: HTMLElement) =>
	Runtime.run(
		Runtime.makeElement({
			...cart,
			view,
			container,
			resources: CartApi.layer,
		})
	)
// #endregion snippet
