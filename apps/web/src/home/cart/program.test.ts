import { given, message, model, story } from "foldkit/story"
import { expect, test } from "vitest"
import { Message, cart } from "./program"

const socks = { name: "Wool socks", price: 12 }
const cap = { name: "Linen cap", price: 24 }

test("stays unsaved when the save finishes after another item was added", function () {
	story(
		cart.update,
		given({ items: [socks, cap], status: "Unsaved" }),
		message(Message.CompletedSaveCart({ items: [socks] })),
		model(function (nextModel) {
			expect(nextModel.status).toBe("Unsaved")
		})
	)
})

test("is saved when the save finishes with every item", function () {
	story(
		cart.update,
		given({ items: [socks, cap], status: "Saving" }),
		message(Message.CompletedSaveCart({ items: [socks, cap] })),
		model(function (nextModel) {
			expect(nextModel.status).toBe("Saved")
		})
	)
})
