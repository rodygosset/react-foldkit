import type { AnyRouter } from "@tanstack/react-router"
import { Context, Effect, Layer, ManagedRuntime, Schema } from "effect"
import { Loader as RootLoader } from "react-foldkit"
import * as Loader from "react-foldkit/loader"
import * as Query from "react-foldkit/query"
import * as TanStackSource from "react-foldkit/tanstack"
import { describe, expectTypeOf, it } from "vitest"

const Data = Schema.Struct({ id: Schema.String, at: Schema.DateFromString })
type Data = typeof Data.Type
const RecordLoader = Loader.define({ name: "Project", data: Data, key: (data) => data.id })
class Reader extends Context.Service<Reader, { readonly value: Data }>()("LoaderTypeTest/Reader") {}
declare const router: AnyRouter
declare const serviceful: Schema.Codec<Data, typeof Data.Encoded, Reader, Reader>
declare const input: Effect.Effect<Data, "unavailable", Reader>

describe("Loader public types", function () {
	it("exports the same declaration API from the root", function () {
		expectTypeOf(RootLoader.define).toEqualTypeOf<typeof Loader.define>()
		expectTypeOf(RecordLoader).toEqualTypeOf<Loader.Loader<Data, typeof Data.Encoded>>()
	})

	if (false) {
		const program = input.pipe(RecordLoader.load)
		expectTypeOf(program).toEqualTypeOf<
			Effect.Effect<Loader.Envelope<typeof Data.Encoded>, "unavailable" | Schema.SchemaError, Reader>
		>()
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
		Loader.define({ name: "Serviceful", data: serviceful, key: (data) => data.id })
		// @ts-expect-error Resource keys are strings.
		Loader.define({ name: "Invalid", data: Data, key: () => 42 })

		const mapped = RecordLoader.pipe(
			Loader.mapMessages((data, receipt) => ({ _tag: "Project" as const, data, receipt }))
		)
		expectTypeOf(mapped).toEqualTypeOf<
			Loader.Loader<
				Data,
				typeof Data.Encoded,
				{
					_tag: "Project"
					data: Data
					receipt: Loader.Receipt
				}
			>
		>()
		const other = Loader.define({ name: "Count", data: Schema.Number, key: () => "count" }).pipe(
			Loader.mapMessages((count, receipt) => ({ _tag: "Count" as const, count, receipt }))
		)
		const source = TanStackSource.make(router, [mapped, other])
		expectTypeOf(source).toEqualTypeOf<
			import("react-foldkit/commitSource").CommitSource<
				| { _tag: "Project"; data: Data; receipt: Loader.Receipt }
				| { _tag: "Count"; count: number; receipt: Loader.Receipt }
			>
		>()
		// @ts-expect-error Message mapping receives the declaration's payload, not arbitrary values.
		Loader.mapMessages(RecordLoader, (data: number) => data)

		const keyed = Query.define({
			name: "Typed",
			args: { id: Schema.String },
			data: Schema.String,
			error: Schema.String,
			execute: () => Effect.succeed("ok"),
		})
		const keyedLoader = Loader.fromQuery(keyed)
		expectTypeOf(keyedLoader.Load.Type).toExtend<{ readonly id: string; readonly result: unknown }>()
		expectTypeOf(keyedLoader.loadQuery({ id: "a" })).toExtend<
			Effect.Effect<Loader.Envelope<unknown>, Schema.SchemaError, never>
		>()
		expectTypeOf(Loader.loadQuery(keyedLoader, { id: "a" })).toExtend<
			Effect.Effect<Loader.Envelope<unknown>, Schema.SchemaError, never>
		>()
		const mappedKeyed = keyedLoader.pipe(Loader.mapMessages((load) => ({ _tag: "Completed" as const, load })))
		// @ts-expect-error mapMessages strips Load
		mappedKeyed.Load
		// @ts-expect-error mapMessages strips query
		mappedKeyed.query
		// @ts-expect-error mapMessages strips loadQuery
		mappedKeyed.loadQuery
		expectTypeOf(keyedLoader.loadQuery).toBeFunction()

		const query = Query.define({
			name: "Home",
			data: Schema.String,
			error: Schema.String,
			execute: Effect.succeed("home"),
		})
		const homeLoader = Loader.fromQuery(query, {
			key: () => "home",
		})
		expectTypeOf(homeLoader.Load.Type).toExtend<{ readonly result: unknown }>()
		expectTypeOf(homeLoader.Load.Type).not.toExtend<{ readonly id: string }>()
		// @ts-expect-error Queries require options.key.
		Loader.fromQuery(query)
	}
})
