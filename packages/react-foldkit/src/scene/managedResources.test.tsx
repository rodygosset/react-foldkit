import { Effect, Option } from "effect"
import React from "react"
import { expect, it } from "vitest"
import * as Engine from "../../test/fixtures/managedResource"
import * as Application from "../application"
import * as Scene from "./index"
import { bindSceneView } from "./react"

it("uses Foldkit's Managed Resource Scene steps without acquiring live resources", function () {
	let acquisitions = 0
	const program = Engine.make(
		(id) =>
			Effect.sync(function () {
				acquisitions += 1
				return { id }
			}),
		undefined,
		Option.some("a")
	)
	const engine = program.managedResources.engine
	const App = Application.define(program)
	function View() {
		const model = App.useModel()
		const send = App.useSend()
		return (
			<main>
				<button onClick={() => send.DisabledEngine()}>Stop</button>
				<p role="status">{model.events.join(",")}</p>
			</main>
		)
	}
	Scene.scene(
		{ update: program.update, view: bindSceneView(App, View) },
		Scene.given(program.init().model),
		Scene.ManagedResource.acquire(engine, { id: "a" }),
		Scene.expect(Scene.role("status")).toHaveText("AcquiredEngine:a"),
		Scene.click(Scene.role("button", { name: "Stop" })),
		Scene.ManagedResource.release(engine),
		Scene.expect(Scene.role("status")).toHaveText("AcquiredEngine:a,ReleasedEngine")
	)
	expect(acquisitions).toBe(0)
})
