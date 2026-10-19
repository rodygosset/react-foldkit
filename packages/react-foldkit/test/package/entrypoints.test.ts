import { Effect, Result } from "effect"
import * as Foldkit from "react-foldkit"
import * as ReactFoldkit from "react-foldkit/react"
import * as Submodel from "react-foldkit/submodel"
import * as Store from "react-foldkit/store"
import { describe, expect, it } from "vitest"

describe("built package entry points", function () {
	it("exports only React Foldkit modules", function () {
		// Foldkit vocabulary is imported from foldkit itself.
		expect(Object.keys(Foldkit).sort()).toEqual(["ModelSource", "ReactFoldkit", "Store", "Submodel"])
	})

	it("shares public error constructors across the root and subpath exports", function () {
		expect(Foldkit.Store.CommitError).toBe(Store.CommitError)
		expect(Foldkit.Submodel.ProviderError).toBe(Submodel.ProviderError)
		expect(Foldkit.Submodel.define).toBe(Submodel.define)
		expect(Foldkit.Submodel.lift).toBe(Submodel.lift)
		expect(Foldkit.ReactFoldkit.defineApplication).toBe(ReactFoldkit.defineApplication)
	})

	it("returns a CommitError recognized through every Store export", function () {
		const store = Foldkit.Store.boot(
			{ update: (model: number, message: number) => ({ model: model + message }) },
			{ model: 0 }
		)
		Effect.runSync(store.dispose())

		const committed = store.commit(1)
		expect(Result.isFailure(committed)).toBe(true)
		if (Result.isFailure(committed)) {
			expect(committed.failure).toBeInstanceOf(Store.CommitError)
			expect(committed.failure).toBeInstanceOf(Foldkit.Store.CommitError)
			expect(committed.failure.reason._tag).toBe("Disposed")
		}
	})
})
