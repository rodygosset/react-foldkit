import { Effect, Result, Schema } from "effect"
import * as Foldkit from "react-foldkit"
import * as AsyncData from "react-foldkit/asyncData"
import * as Command from "react-foldkit/command"
import * as CommitSource from "react-foldkit/commitSource"
import * as Loader from "react-foldkit/loader"
import * as Query from "react-foldkit/query"
import * as ReactFoldkit from "react-foldkit/react"
import * as Store from "react-foldkit/store"
import * as Struct from "react-foldkit/struct"
import { describe, expect, it } from "vitest"

describe("built package entry points", function () {
	it("preserves Foldkit reexports and executes Query settlement through the built entry points", function () {
		expect(Foldkit.AsyncData.Success).toBe(AsyncData.Success)
		expect(Foldkit.Command.define).toBe(Command.define)
		expect(Foldkit.Struct.modifyFields).toBe(Struct.modifyFields)
		expect(Foldkit.Query.define).toBe(Query.define)

		const query = Query.define({
			name: "Package",
			data: Schema.String,
			error: Schema.String,
			execute: Effect.succeed("fetch"),
		})
		const settled = query.settle(query.init("package"), AsyncData.Success({ data: "external" }))
		expect(query.read(settled.model)).toEqual(Foldkit.AsyncData.Success({ data: "external" }))
	})

	it("shares public error constructors across the root and subpath exports", function () {
		expect(Foldkit.CommitSource.CommitSourceError).toBe(CommitSource.CommitSourceError)
		expect(ReactFoldkit.CommitSourceError).toBe(CommitSource.CommitSourceError)
		expect(Foldkit.Loader.define).toBe(Loader.define)
		expect(Foldkit.Store.CommitError).toBe(Store.CommitError)
		expect(Foldkit.ReactFoldkit.SubmodelProviderError).toBe(ReactFoldkit.SubmodelProviderError)

		const error = new ReactFoldkit.CommitSourceError({ reason: "SourceChanged" })
		expect(error).toBeInstanceOf(CommitSource.CommitSourceError)
		expect(error).toBeInstanceOf(Foldkit.CommitSource.CommitSourceError)
	})

	it("returns a CommitError recognized through every Store export", function () {
		const store = Foldkit.Store.boot(
			{ update: (model: number, message: number) => ({ model: model + message }) },
			{ model: 0 }
		)
		store.dispose()

		const committed = store.commit(1)
		expect(Result.isFailure(committed)).toBe(true)
		if (Result.isFailure(committed)) {
			expect(committed.failure).toBeInstanceOf(Store.CommitError)
			expect(committed.failure).toBeInstanceOf(Foldkit.Store.CommitError)
			expect(committed.failure.reason).toBe("Disposed")
		}
	})
})
