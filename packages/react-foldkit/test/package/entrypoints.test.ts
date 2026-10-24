import { Effect, Result } from "effect"
import { Message } from "../fixtures/message"
import * as Foldkit from "react-foldkit"
import * as Program from "react-foldkit/program"
import * as Application from "react-foldkit/application"
import * as Submodel from "react-foldkit/submodel"
import * as Store from "react-foldkit/store"
import * as Scene from "react-foldkit/scene"
import * as SceneReact from "react-foldkit/scene/react"
import * as FoldkitScene from "foldkit/scene"
import * as Vite from "react-foldkit/vite"
import { describe, expect, it } from "vitest"

describe("built package entry points", function () {
	it("exports only React Foldkit modules", function () {
		// Foldkit vocabulary is imported from foldkit itself.
		expect(Object.keys(Foldkit).sort()).toEqual(["Application", "ModelSource", "Program", "Store", "Submodel"])
	})

	it("shares public error constructors across the root and subpath exports", function () {
		expect(Foldkit.Store.CommitError).toBe(Store.CommitError)
		expect(Foldkit.Submodel.ProviderError).toBe(Submodel.ProviderError)
		expect(Foldkit.Submodel.define).toBe(Submodel.define)
		expect(Foldkit.Submodel.lift).toBe(Submodel.lift)
		expect(Foldkit.Application.define).toBe(Application.define)
		expect(Foldkit.Program.make).toBe(Program.make)
	})

	it("returns a CommitError recognized through every Store export", function () {
		const store = Foldkit.Store.boot(
			{ update: (model: number, message: Message) => ({ model: model + message.value }) },
			{ model: 0 }
		)
		Effect.runSync(store.dispose())

		const committed = store.commit(Message.SetValue({ value: 1 }))
		expect(Result.isFailure(committed)).toBe(true)
		if (Result.isFailure(committed)) {
			expect(committed.failure).toBeInstanceOf(Store.CommitError)
			expect(committed.failure).toBeInstanceOf(Foldkit.Store.CommitError)
			expect(committed.failure.reason._tag).toBe("Disposed")
		}
	})

	it("mirrors foldkit/scene from the scene entry and binds React views from scene/react", function () {
		// The scene entry is the one place that reexports Foldkit, so tests migrate by changing the import.
		expect(Object.keys(Scene).sort()).toEqual(Object.keys(FoldkitScene).sort())
		expect(Scene.click).not.toBe(FoldkitScene.click)
		expect(Scene.scene).not.toBe(FoldkitScene.scene)
		expect(Object.keys(SceneReact)).toEqual(["bindSceneView"])
	})

	it("exports the DevTools and model-preservation Vite plugins", function () {
		expect(Object.keys(Vite).sort()).toEqual(["devTools", "preserveModel"])
		const plugins = [Vite.devTools()].flat(2) as ReadonlyArray<{ readonly name: string }>
		expect(plugins.map(({ name }) => name)).toEqual(["react-foldkit:devtools", "react-foldkit:devtools-relay"])
		const preserve = [Vite.preserveModel()].flat(2) as ReadonlyArray<{ readonly name: string }>
		expect(preserve.map(({ name }) => name)).toEqual(["react-foldkit:preserve-model"])
	})
})
