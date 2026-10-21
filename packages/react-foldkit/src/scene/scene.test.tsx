import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import React from "react"
import { describe, expect, it } from "vitest"
import * as Application from "../application"
import * as Scene from "./index"
import { bindSceneView } from "./react"

const Model = Schema.Struct({ count: Schema.Finite, value: Schema.String, typed: Schema.String, files: Schema.Finite, drops: Schema.Finite })
type Model = typeof Model.Type
const Message = defineMessageUnion({
	Increment: {},
	Changed: { value: Schema.String },
	Typed: { value: Schema.String },
	FilesSelected: { count: Schema.Finite },
	FilesDropped: { count: Schema.Finite },
})
type Message = typeof Message.Type

const update = (model: Model, message: Message) =>
	Message.match(message, {
		Increment: () => ({ model: { ...model, count: model.count + 1 } }),
		Changed: ({ value }) => ({ model: { ...model, value } }),
		Typed: ({ value }) => ({ model: { ...model, typed: value } }),
		FilesSelected: ({ count }) => ({ model: { ...model, files: count } }),
		FilesDropped: ({ count }) => ({ model: { ...model, drops: count } }),
	})

const App = Application.define({
	Model,
	Message,
	update,
})

function Profile() {
	const model = App.useModel()
	const send = App.useSend()
	const [local, setLocal] = React.useState(0)
	return (
		<main>
			<h1>Count {model.count}</h1>
			<p>local {local}</p>
			<p>files {model.files}; drops {model.drops}</p>
			<button onClick={function () { setLocal((value) => value + 1); send.Increment() }}>Increment</button>
			<input aria-label="Value" value={model.value} onChange={(event) => send.Changed({ value: event.target.value })} />
			<input aria-label="Typed" value={model.typed} onInput={(event) => send.Typed({ value: event.currentTarget.value })} />
			<input type="file" data-testid="files" onChange={(event) => send.FilesSelected({ count: event.target.files?.length ?? 0 })} />
			<div data-testid="drop-zone" onDrop={function (event) { event.preventDefault(); send.FilesDropped({ count: event.dataTransfer.files.length }) }}>Drop files</div>
		</main>
	)
}

const view = bindSceneView(App, Profile)
const initial = { count: 0, value: "", typed: "", files: 0, drops: 0 }

describe("Scene with a bound React view", function () {
	it("renders Application hooks, dispatches Scene Messages, and retains local state", function () {
		Scene.scene({ update, view },
			Scene.given(initial),
			Scene.expect(Scene.role("heading", { name: "Count 0" })).toExist(),
			Scene.click(Scene.role("button", { name: "Increment" })),
			Scene.expect(Scene.role("heading", { name: "Count 1" })).toExist(),
			Scene.expect(Scene.text("local 1")).toExist(),
			Scene.change(Scene.role("textbox", { name: "Value" }), "Ada"),
			Scene.expect(Scene.role("textbox", { name: "Value" })).toHaveValue("Ada"),
			Scene.type(Scene.role("textbox", { name: "Typed" }), "typed"),
			Scene.expect(Scene.role("textbox", { name: "Typed" })).toHaveValue("typed"),
			Scene.changeFiles(Scene.testId("files"), [new File(["a"], "avatar.png")]),
			Scene.expect(Scene.text("files 1; drops 0")).toExist(),
			Scene.dropFiles(Scene.testId("drop-zone"), [new File(["d"], "dropped.png")]),
			Scene.expect(Scene.text("files 1; drops 1")).toExist(),
		)
	})

	it("cleans up React Effects when a Scene assertion throws", function () {
		let cleaned = false
		function WithEffect() {
			React.useEffect(() => function () { cleaned = true }, [])
			return <p>ready</p>
		}
		const effectView = bindSceneView(App, WithEffect)
		expect(() => Scene.scene({ update, view: effectView }, Scene.given(initial), Scene.expect(Scene.text("missing")).toExist())).toThrow()
		expect(cleaned).toBe(true)
	})
})
