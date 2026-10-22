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

const ValueMessage = defineMessageUnion({ SetValue: { value: Schema.Finite } })
type ValueMessage = typeof ValueMessage.Type

export type Reader = Foldkit.ModelSource.ModelReader<number>
export type Program = Foldkit.Store.Program<number, ValueMessage>
export type RuntimeStore = Foldkit.Store.Store<number, ValueMessage>
export type CounterApplication = Foldkit.Application.Application<number, ValueMessage>
export type Projection = Foldkit.Submodel.Projection<number, ValueMessage, number, ValueMessage>

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
	Message: ValueMessage,
	update: (model: number, message: ValueMessage) => ({ model: model + message.value }),
})
// Foldkit's own DevToolsConfig is accepted unchanged, so the settings carry over to Foldkit's runtime.
const devToolsSettings = {
	position: "BottomRight",
	mode: "TimeTravel",
	maxEntries: 100,
	Message: ValueMessage,
} as const
const WithDevTools = Application.define(
	{
		Model: Schema.Finite,
		Message: ValueMessage,
		update: (model: number, message: ValueMessage) => ({ model: model + message.value }),
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

function addValue(model: number, message: ValueMessage) {
	return { model: model + message.value }
}
function Counter() {
	const send = App.useSend()
	return createElement(
		"button",
		{
			onClick: function () {
				send.SetValue({ value: 1 })
			},
		},
		"Count " + String(App.useModel())
	)
}
Scene.scene(
	{ update: addValue, view: bindSceneView(App, Counter) },
	Scene.given(0),
	Scene.click(Scene.role("button", { name: "Count 0" })),
	Scene.expect(Scene.role("button")).toHaveText("Count 1")
)

const TextMessage = defineMessageUnion({ SetText: { value: Schema.String } })
type TextMessage = typeof TextMessage.Type

function replaceText(_model: string, message: TextMessage) {
	return { model: message.value }
}
const InputApp = Application.define({
	Model: Schema.String,
	Message: TextMessage,
	update: replaceText,
})
function InputView() {
	const model = InputApp.useModel()
	const send = InputApp.useDispatch()
	const [ready, setReady] = useState(false)
	useEffect(
		function initialize() {
			send(TextMessage.SetText({ value: "ready" }))
			setReady(true)
		},
		[send]
	)
	return createElement(
		"main",
		{
			onClick: function (event) {
				const action = (event.target as HTMLElement).getAttribute("data-action") ?? "missing"
				send(TextMessage.SetText({ value: action }))
			},
			onChange: function (event) {
				send(TextMessage.SetText({ value: (event.target as HTMLInputElement).value }))
			},
			onPointerDown: function (event) {
				send(TextMessage.SetText({ value: (event.target as HTMLElement).dataset.action ?? "missing" }))
			},
		},
		createElement("input", { value: model, onChange: constVoid }),
		createElement("button", { "data-action": "saved" }, "Save"),
		createElement("p", null, String(ready))
	)
}
Scene.scene(
	{ update: replaceText, view: bindSceneView(InputApp, InputView) },
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
