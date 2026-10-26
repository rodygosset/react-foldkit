import { Command, click, expect, given, role, scene } from "react-foldkit/scene"
import { Message, SaveCart, cart, initialModel } from "./program"
import { bindSceneView } from "react-foldkit/scene/react"
import { test } from "vitest"
import { CartView, Shop } from "./cart"

// The home page shows the first import line. Moving the cart's view to Foldkit changes only that line.
const view = bindSceneView(Shop, CartView)

test("adds an item and saves the cart through a Command", function () {
	scene(
		{ update: cart.update, view },
		given(initialModel),
		expect(role("button", { name: "Save cart" })).toBeDisabled(),

		click(role("button", { name: "Add Wool socks" })),
		expect(role("paragraph")).toHaveText("1 in cart · €12"),

		click(role("button", { name: "Save cart" })),
		Command.expectExact(SaveCart({ items: ["Wool socks"] })),
		expect(role("button", { name: "Saving..." })).toBeDisabled(),

		Command.resolve(SaveCart, Message.SavedCart()),
		expect(role("button", { name: "Saved" })).toExist()
	)
})
