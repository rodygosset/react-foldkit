import { strict as assert } from "node:assert"
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
import * as Scene from "react-foldkit/scene"
import { bindSceneView } from "react-foldkit/scene/react"

export type Reader = Foldkit.ModelSource.ModelReader<number>
export type Program = Foldkit.Store.Program<number, number>
export type RuntimeStore = Foldkit.Store.Store<number, number>
export type CounterApplication = Foldkit.Application.Application<number, number>
export type Projection = Foldkit.Submodel.Projection<number, number, number, number>

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

function Counter() {
	const send = App.useSend()
	return createElement("button", { onClick: () => send(1) }, "Count " + String(App.useModel()))
}
Scene.scene(
	{ update: (model: number, message: number) => ({ model: model + message }), view: bindSceneView(App, Counter) },
	Scene.given(0),
	Scene.click(Scene.role("button", { name: "Count 0" })),
	Scene.expect(Scene.role("button")).toHaveText("Count 1")
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
