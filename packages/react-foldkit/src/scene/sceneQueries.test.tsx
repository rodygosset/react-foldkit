import { Option, Schema } from "effect"
import type { HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import * as FoldkitScene from "foldkit/scene"
import React from "react"
import { expect, it } from "vitest"
import * as Application from "../application"
import * as Scene from "../scene"
import { bindSceneView } from "./react"

const Message = defineMessageUnion({ Clicked: {} })
type Message = typeof Message.Type
const update = (model: string, _message: Message) => ({ model })
const App = Application.define({ Model: Schema.String, Message, update })

it("uses present boolean attributes in every React role query", function () {
	function View() {
		return (
			<main>
				<button disabled>Disabled</button>
				<button disabled={false}>Enabled</button>
			</main>
		)
	}
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given(""),
		Scene.expect(Scene.role("button", { disabled: true })).toHaveAttr("disabled", ""),
		Scene.expect(Scene.role("button", { disabled: false })).not.toHaveAttr("disabled"),
		Scene.expectAll(Scene.all.role("button", { disabled: true })).toHaveCount(1),
		Scene.tap(function ({ html }) {
			expect(Option.isSome(Scene.getByRole("button", { disabled: true })(html))).toBe(true)
			expect(Scene.getAllByRole("button", { disabled: false })(html)).toHaveLength(1)
		})
	)
})

it("preserves upstream role query results for native Foldkit views", function () {
	const view = (_model: string, h: HtmlBuilder<Message>) =>
		h.main([], [h.button([h.Disabled(true)], ["Disabled"]), h.button([], ["Enabled"])])
	Scene.scene(
		{ update, view },
		Scene.given(""),
		Scene.expect(Scene.role("button", { disabled: true })).toHaveText("Disabled"),
		Scene.expectAll(Scene.all.role("button", { disabled: false })).toHaveCount(1),
		Scene.tap(function ({ html }) {
			expect(Scene.getByRole("button", { disabled: true })(html)).toEqual(
				FoldkitScene.getByRole("button", { disabled: true })(html)
			)
			expect(Scene.getAllByRole("button", { disabled: false })(html)).toEqual(
				FoldkitScene.getAllByRole("button", { disabled: false })(html)
			)
		})
	)
})
