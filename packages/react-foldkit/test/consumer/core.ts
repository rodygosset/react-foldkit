import { strict as assert } from "node:assert"
import { Effect, Option, Schema } from "effect"
import { constVoid } from "effect/Function"
import * as AsyncData from "foldkit/asyncData"
import * as Query from "foldkit/experimental/query"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import * as Foldkit from "react-foldkit"
import type { ModelReader } from "react-foldkit/modelSource"
import { defineApplication } from "react-foldkit/react"
import * as Store from "react-foldkit/store"
import * as Submodel from "react-foldkit/submodel"

export type Reader = Foldkit.ModelSource.ModelReader<number>
export type Program = Foldkit.Store.Program<number, number>
export type RuntimeStore = Foldkit.Store.Store<number, number>
export type Application = Foldkit.ReactFoldkit.Application<number, number>
export type Projection = Foldkit.Submodel.Projection<number, number, number, number>

const reader: Reader = {
	getSnapshot: () => 7,
	getServerSnapshot: () => 7,
	subscribe: () => constVoid,
}
const directReader: ModelReader<number> = reader
assert.equal(directReader.getSnapshot(), 7)
assert.equal(Foldkit.Submodel.define, Submodel.define)
assert.deepEqual(Object.keys(Foldkit).sort(), ["ModelSource", "Program", "ReactFoldkit", "Store", "Submodel"])

const App = defineApplication({
	Model: Schema.Finite,
	Message: Schema.Finite,
	update: (model: number, message: number) => ({ model: model + message }),
})
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
