import { strict as assert } from "node:assert"
import { defineMessageUnion } from "foldkit/message"
import { Effect, Option, Schema } from "effect"
import { constVoid } from "effect/Function"
import * as AsyncData from "foldkit/asyncData"
import * as Query from "foldkit/experimental/query"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import * as Foldkit from "react-foldkit"
import type { ModelReader } from "react-foldkit/modelSource"
import * as Application from "react-foldkit/application"
import * as Store from "react-foldkit/store"
import * as Submodel from "react-foldkit/submodel"

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
