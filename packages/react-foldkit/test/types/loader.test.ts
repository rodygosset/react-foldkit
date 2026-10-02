import type { AnyRouter } from "@tanstack/react-router"
import { Context, Effect, Layer, ManagedRuntime, Schema } from "effect"
import { Loader as RootLoader } from "react-foldkit"
import * as Loader from "react-foldkit/loader"
import * as Query from "react-foldkit/query"
import * as TanStackSource from "react-foldkit/tanstack"
import { describe, expectTypeOf, it } from "vitest"

const Data = Schema.Struct({ id: Schema.String, at: Schema.DateFromString })
type Data = typeof Data.Type
const RecordLoader = Loader.define({ name: "Project", data: Data, key: function (data) { return data.id } })
class Reader extends Context.Service<Reader, { readonly value: Data }>()("LoaderTypeTest/Reader") {}
declare const router: AnyRouter
declare const serviceful: Schema.Codec<Data, typeof Data.Encoded, Reader, Reader>
declare const input: Effect.Effect<Data, "unavailable", Reader>

describe("Loader public types", () => {
	it("exports the same declaration API from the root", () => {
		expectTypeOf(RootLoader.define).toEqualTypeOf<typeof Loader.define>()
		expectTypeOf(RecordLoader).toEqualTypeOf<Loader.Loader<Data, typeof Data.Encoded>>()
	})

	if (false) {
		const program = input.pipe(RecordLoader.load)
		expectTypeOf(program).toEqualTypeOf<Effect.Effect<
			Loader.Envelope<typeof Data.Encoded>, "unavailable" | Schema.SchemaError, Reader
		>>()
		// @ts-expect-error Required services are preserved until host provisioning.
		Effect.runPromise(program)
		const runtime = ManagedRuntime.make(Layer.succeed(Reader, { value: { id: "a", at: new Date() } }))
		runtime.runPromise(program)
		// @ts-expect-error load accepts no runtime or execution options.
		RecordLoader.load(input, { runtime })
		// @ts-expect-error load accepts no Layer.
		RecordLoader.load(input, Layer.empty)
		// @ts-expect-error The input must produce the declared decoded payload.
		RecordLoader.load(Effect.succeed({ id: "a", at: "encoded" }))
		// @ts-expect-error The Codec must encode/decode without services.
		Loader.define({ name: "Serviceful", data: serviceful, key: function (data) { return data.id } })
		// @ts-expect-error Resource keys are strings.
		Loader.define({ name: "Invalid", data: Data, key: function () { return 42 } })

		const mapped = RecordLoader.pipe(Loader.mapMessages(function (data, receipt) {
			return { _tag: "Project" as const, data, receipt }
		}))
		expectTypeOf(mapped).toEqualTypeOf<Loader.Loader<Data, typeof Data.Encoded, {
			_tag: "Project", data: Data, receipt: Loader.Receipt,
		}>>()
		const other = Loader.define({ name: "Count", data: Schema.Number, key: function () { return "count" } }).pipe(
			Loader.mapMessages(function (count, receipt) {
				return { _tag: "Count" as const, count, receipt }
			})
		)
		const source = TanStackSource.make(router, [mapped, other])
		expectTypeOf(source).toEqualTypeOf<import("react-foldkit/commitSource").CommitSource<
			{ _tag: "Project", data: Data, receipt: Loader.Receipt } |
			{ _tag: "Count", count: number, receipt: Loader.Receipt }
		>>()
		// @ts-expect-error Message mapping receives the declaration's payload, not arbitrary values.
		Loader.mapMessages(RecordLoader, function (data: number) { return data })

		const keyed = Query.define({
			name: "Typed",
			args: { id: Schema.String },
			data: Schema.String,
			error: Schema.String,
			execute: function () { return Effect.succeed("ok") },
		})
		const keyedLoader = Loader.fromQuery(keyed)
		expectTypeOf(keyedLoader.Load.Type).toExtend<{ readonly id: string; readonly result: unknown }>()
		expectTypeOf(keyedLoader.loadQuery({ id: "a" })).toExtend<
			Effect.Effect<Loader.Envelope<unknown>, Schema.SchemaError, never>
		>()
		expectTypeOf(Loader.loadQuery(keyedLoader, { id: "a" })).toExtend<
			Effect.Effect<Loader.Envelope<unknown>, Schema.SchemaError, never>
		>()

		const query = Query.define({
			name: "Home",
			data: Schema.String,
			error: Schema.String,
			execute: Effect.succeed("home"),
		})
		const homeLoader = Loader.fromQuery(query, {
			key: function () { return "home" },
		})
		expectTypeOf(homeLoader.Load.Type).toExtend<{ readonly result: unknown }>()
		expectTypeOf(homeLoader.Load.Type).not.toExtend<{ readonly id: string }>()
		// @ts-expect-error Unkeyed Queries require options.key.
		Loader.fromQuery(query)
	}
})
