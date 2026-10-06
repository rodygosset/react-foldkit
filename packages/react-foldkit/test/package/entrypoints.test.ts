import { Effect, Result, Schema } from "effect"
import * as Foldkit from "react-foldkit"
import * as AsyncData from "react-foldkit/asyncData"
import * as Command from "react-foldkit/command"
import * as CommitSource from "react-foldkit/commitSource"
import * as Loader from "react-foldkit/loader"
import * as Query from "foldkit/experimental/query"
import * as ReactFoldkit from "react-foldkit/react"
import * as Store from "react-foldkit/store"
import * as Struct from "react-foldkit/struct"
import { describe, expect, it } from "vitest"

describe("built package entry points", function () {
	it("preserves Foldkit reexports and loads a Foldkit Query through the built Loader", function () {
		expect(Foldkit.AsyncData.Success).toBe(AsyncData.Success)
		expect(Foldkit.Command.define).toBe(Command.define)
		expect(Foldkit.Struct.modifyFields).toBe(Struct.modifyFields)

		const query = Query.define({
			name: "Package",
			data: Schema.String,
			error: Schema.String,
			execute: Effect.succeed("fetch"),
		})
		const loader = Loader.fromQuery(query)
		const envelope = Effect.runSync(loader.loadQuery)
		expect(Result.getOrThrow(loader.decode(envelope))).toEqual({
			result: Foldkit.AsyncData.Success({ data: "fetch" }),
		})
	})

	it("shares public error constructors across the root and subpath exports", function () {
		expect(Foldkit.CommitSource.CommitSourceError).toBe(CommitSource.CommitSourceError)
		expect(ReactFoldkit.CommitSourceError).toBe(CommitSource.CommitSourceError)
		expect(Foldkit.Loader.define).toBe(Loader.define)
		expect(Foldkit.Store.CommitError).toBe(Store.CommitError)
		expect(Foldkit.ReactFoldkit.SubmodelProviderError).toBe(ReactFoldkit.SubmodelProviderError)

		const error = new ReactFoldkit.CommitSourceError({ reason: "Reentrant" })
		expect(error).toBeInstanceOf(CommitSource.CommitSourceError)
		expect(error).toBeInstanceOf(Foldkit.CommitSource.CommitSourceError)
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
			expect(committed.failure.reason).toBe("Disposed")
		}
	})
})
