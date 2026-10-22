import { strict as assert } from "node:assert"
import { defineMessageUnion } from "foldkit/message"
import { Effect, Option, Schema } from "effect"
import { constVoid } from "effect/Function"
import * as AsyncData from "foldkit/asyncData"
import * as Query from "foldkit/experimental/query"
import { createElement, useEffect, useState } from "react"
import { renderToString } from "react-dom/server"
import * as Foldkit from "react-foldkit"
import type { ModelReader } from "react-foldkit/modelSource"
import * as Application from "react-foldkit/application"
import * as Store from "react-foldkit/store"
import * as Submodel from "react-foldkit/submodel"
import * as Scene from "react-foldkit/scene"
import { bindSceneView } from "react-foldkit/scene/react"

const Message = defineMessageUnion({ SetValue: { value: Schema.Finite } })
type Message = typeof Message.Type

export type Reader = Foldkit.ModelSource.ModelReader<number>
export type Program = Foldkit.Store.Program<number, Message>
export type RuntimeStore = Foldkit.Store.Store<number, Message>
export type CounterApplication = Foldkit.Application.Application<number, Message>
export type Projection = Foldkit.Submodel.Projection<number, Message, number, Message>

const reader: Reader = {
	getSnapshot: () => 7,
	getServerSnapshot: () => 7,
	subscribe: () => constVoid,
}
const directReader: ModelReader<number> = reader
assert.equal(directReader.getSnapshot(), 7)
assert.equal(Foldkit.Submodel.define, Submodel.define)
assert.deepEqual(Object.keys(Foldkit).sort(), ["Application", "ModelSource", "Program", "Store", "Submodel"])

const App = Application.define({
	Model: Schema.Finite,
	Message,
	update: (model: number, message: Message) => ({ model: model + message.value }),
})
// Foldkit's own DevToolsConfig is accepted unchanged, so the settings carry over to Foldkit's runtime.
const devToolsSettings = {
	position: "BottomRight",
	mode: "TimeTravel",
	maxEntries: 100,
	Message,
} as const
const WithDevTools = Application.define(
	{
		Model: Schema.Finite,
		Message,
		update: (model: number, message: Message) => ({ model: model + message.value }),
	},
	{ devTools: devToolsSettings }
)
assert.equal(renderToString(createElement(WithDevTools.Provider, { init: { model: 1 }, children: null })), "")

function View() {
	return createElement("span", null, App.useModel())
}
assert.equal(
	renderToString(createElement(App.Provider, { init: { model: 7 }, children: createElement(View) })),
	"<span>7</span>"
)

function Counter() {
	const send = App.useSend()
	return createElement(
		"button",
		{
			onClick() {
				send.SetValue({ value: 1 })
			},
		},
		"Count " + String(App.useModel())
	)
}
Scene.scene(
	{
		update: (model: number, message: Message) => ({ model: model + message.value }),
		view: bindSceneView(App, Counter),
	},
	Scene.given(0),
	Scene.click(Scene.role("button", { name: "Count 0" })),
	Scene.expect(Scene.role("button")).toHaveText("Count 1")
)

{
	const Message = defineMessageUnion({ SetText: { text: Schema.String } })
	type Message = typeof Message.Type

	const update = (_model: string, message: Message) => ({ model: message.text })
	const InputApp = Application.define({
		Model: Schema.String,
		Message,
		update,
	})
	function InputView() {
		const model = InputApp.useModel()
		const send = InputApp.useDispatch()
		const [ready, setReady] = useState(false)
		useEffect(
			function initialize() {
				send(Message.SetText({ text: "ready" }))
				setReady(true)
			},
			[send]
		)
		return createElement(
			"main",
			{
				onClick(event) {
					const action = (event.target as HTMLElement).getAttribute("data-action") ?? "missing"
					send(Message.SetText({ text: action }))
				},
				onChange(event) {
					send(Message.SetText({ text: (event.target as HTMLInputElement).value }))
				},
				onPointerDown(event) {
					send(Message.SetText({ text: (event.target as HTMLElement).dataset.action ?? "missing" }))
				},
			},
			createElement("input", { value: model, onChange: constVoid }),
			createElement("button", { "data-action": "saved" }, "Save"),
			createElement("p", null, String(ready))
		)
	}
	Scene.scene(
		{ update, view: bindSceneView(InputApp, InputView) },
		Scene.given("waiting"),
		Scene.expect(Scene.role("textbox")).toHaveValue("ready"),
		Scene.expect(Scene.text("true")).toExist(),
		Scene.type(Scene.role("textbox"), "Ada"),
		Scene.expect(Scene.role("textbox")).toHaveValue("Ada"),
		Scene.pointerDown(Scene.role("button")),
		Scene.expect(Scene.role("textbox")).toHaveValue("saved"),
		Scene.click(Scene.role("button")),
		Scene.expect(Scene.role("textbox")).toHaveValue("saved")
	)
}

const query = Query.define({
	name: "Packed",
	data: Schema.String,
	error: Schema.String,
	execute: Effect.succeed("ok"),
})
await Effect.runPromise(
	Effect.scoped(
		Effect.gen(function* () {
			const store = yield* Store.make({ update: query.update }, query.loadIfMissing(query.init()))
			const data = yield* Store.takeWhen(store, (model) =>
				Option.filter(AsyncData.getData(query.read(model)), (data) => data === "ok")
			)
			assert.equal(data, "ok")
		})
	)
)
