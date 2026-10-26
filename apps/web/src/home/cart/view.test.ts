import { Command, click, expect, given, role, scene } from "foldkit/scene"
import { Message, SaveCart, cart, initialModel } from "./program"
import { test } from "vitest"
import { view } from "./view"

// The same steps as cart.test.tsx. Only the Scene import and the view changed.
test("adds an item and saves the cart through a Command", function () {
	scene(
		{ update: cart.update, view },
		given(initialModel),
		expect(role("button", { name: "Save cart" })).toBeDisabled(),

		click(role("button", { name: "Add Wool socks" })),
		expect(role("paragraph")).toHaveText("1 in cart · €12"),

		click(role("button", { name: "Save cart" })),
		Command.expectExact(SaveCart({ items: [{ name: "Wool socks", price: 12 }] })),
		expect(role("button", { name: "Saving..." })).toBeDisabled(),

		Command.resolve(SaveCart, Message.CompletedSaveCart()),
		expect(role("button", { name: "Saved" })).toExist()
	)
})
