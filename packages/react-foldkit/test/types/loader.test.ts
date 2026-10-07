import type { AnyRouter } from "@tanstack/react-router"
import { DateTime, Context, Effect, Layer, ManagedRuntime, Result, Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import * as AsyncData from "react-foldkit/asyncData"
import { Loader as RootLoader } from "react-foldkit"
import * as Loader from "react-foldkit/loader"
import * as Query from "foldkit/experimental/query"
import * as TanStackSource from "react-foldkit/tanstack"
import type * as Update from "react-foldkit/update"
import { describe, expectTypeOf, it } from "vitest"

const Data = Schema.Struct({ id: Schema.String, at: Schema.DateFromString })
type Data = typeof Data.Type
const RecordLoader = Loader.define({ name: "Project", data: Data, key: (data) => data.id })
class Reader extends Context.Service<Reader, { readonly value: Data }>()("LoaderTypeTest/Reader") {}
declare const router: AnyRouter
declare const serviceful: Schema.Codec<Data, typeof Data.Encoded, Reader, Reader>
declare const input: Effect.Effect<Data, "unavailable", Reader>
declare const structural: Loader.Loader<Data, typeof Data.Encoded, string>

describe("Loader public types", function () {
	it("exports the same declaration API from the root", function () {
		expectTypeOf(RootLoader.define).toEqualTypeOf<typeof Loader.define>()
		expectTypeOf(RecordLoader).toEqualTypeOf<Loader.Loader<Data, typeof Data.Encoded>>()
	})

	if (false) {
		const structuralMapped = Loader.mapMessages(structural, function (id, receipt) {
			expectTypeOf(id).toEqualTypeOf<string>()
			expectTypeOf(receipt).toEqualTypeOf<Loader.Receipt>()
			return { id, receipt }
		})
		expectTypeOf(structuralMapped).toEqualTypeOf<
			Loader.Loader<Data, typeof Data.Encoded, { id: string; receipt: Loader.Receipt }>
		>()
		expectTypeOf(structuralMapped.load(input)).toEqualTypeOf<
			Effect.Effect<Loader.Envelope<typeof Data.Encoded>, "unavailable" | Schema.SchemaError, Reader>
		>()
		// @ts-expect-error Message mapping is exposed through decodeDelivery.
		RecordLoader.toMessage
		const program = input.pipe(RecordLoader.load)
		expectTypeOf(program).toEqualTypeOf<
			Effect.Effect<Loader.Envelope<typeof Data.Encoded>, "unavailable" | Schema.SchemaError, Reader>
		>()
		// @ts-expect-error Required services are preserved until host provisioning.
		void Effect.runPromise(program)
		const runtime = ManagedRuntime.make(
			Layer.succeed(Reader, { value: { id: "a", at: DateTime.toDateUtc(DateTime.nowUnsafe()) } })
		)
		void runtime.runPromise(program)
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
		const other = Loader.define({ name: "Count", data: Schema.Finite, key: () => "count" }).pipe(
			Loader.mapMessages((count, receipt) => ({ _tag: "Count" as const, count, receipt }))
		)
		expectTypeOf<ReturnType<typeof RecordLoader.decode>>().toExtend<Result.Result<Data, Schema.SchemaError>>()
		expectTypeOf<ReturnType<typeof RecordLoader.decodeDelivery>>().toEqualTypeOf<
			Result.Result<Loader.Delivery<Data>, Schema.SchemaError>
		>()
		const source = TanStackSource.make(router, [mapped, other])
		expectTypeOf(source).toEqualTypeOf<
			Result.Result<
				import("react-foldkit/commitSource").CommitSource<
					| { _tag: "Project"; data: Data; receipt: Loader.Receipt }
					| { _tag: "Count"; count: number; receipt: Loader.Receipt },
					Schema.SchemaError
				>,
				TanStackSource.RegistryError
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
		expectTypeOf(keyedLoader.Load.Type).toExtend<{
			readonly args: { readonly id: string }
			readonly result: unknown
		}>()
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

		const transformed = Query.define({
			name: "TransformedTypes",
			args: { id: Schema.FiniteFromString, limit: Schema.optionalKey(Schema.FiniteFromString) },
			data: Schema.DateFromString,
			error: Schema.DateFromString,
			execute: () => Effect.fail(DateTime.toDateUtc(DateTime.nowUnsafe())),
		})
		const transformedLoader = Loader.fromQuery(transformed)
		const settlement = Loader.settleQueryIf(
			transformed,
			transformed.init(),
			{ id: 1 },
			AsyncData.Success({ data: DateTime.toDateUtc(DateTime.nowUnsafe()) }),
			{ fresher: (incoming, current) => incoming > current }
		)
		expectTypeOf(settlement).toEqualTypeOf<
			Update.Return<typeof transformed.Model.Type, typeof transformed.Message.Type>
		>()
		Loader.settleQueryIf(
			transformed,
			transformed.init(),
			// @ts-expect-error Settlement arguments use decoded numbers.
			{ id: "1" },
			AsyncData.Success({ data: DateTime.toDateUtc(DateTime.nowUnsafe()) }),
			{
				fresher: () => true,
			}
		)
		// @ts-expect-error Settlement outcomes use the Query's decoded data type.
		Loader.settleQueryIf(transformed, transformed.init(), { id: 1 }, AsyncData.Success({ data: "encoded date" }), {
			fresher: () => true,
		})
		// @ts-expect-error Settlement failures use the Query's decoded error type.
		Loader.settleQueryIf(transformed, transformed.init(), { id: 1 }, AsyncData.Failure({ error: "encoded date" }), {
			fresher: () => true,
		})
		expectTypeOf(transformedLoader.Load.Type).toEqualTypeOf<{
			readonly args: { readonly id: number; readonly limit?: number }
			readonly result: AsyncData.AsyncData<Date, Date>
		}>()
		expectTypeOf(transformedLoader.Load.Encoded).toEqualTypeOf<{
			readonly args: { readonly id: string; readonly limit?: string }
			readonly result: AsyncData.AsyncDataEncoded<string, string>
		}>()
		transformedLoader.loadQuery({ id: 1 })
		// @ts-expect-error Query arguments use decoded numbers.
		transformedLoader.loadQuery({ id: "1" })

		const Api = HttpApi.make("LoaderTypesApi").add(
			HttpApiGroup.make("projects").add(
				HttpApiEndpoint.get("get", "/projects/:id", {
					params: { id: Schema.String },
					success: Schema.DateFromString,
				}),
				HttpApiEndpoint.get("home", "/home", { success: Schema.String })
			)
		)
		class Client extends Query.HttpApi.Service<Client>()("LoaderTypesClient", { api: Api }) {}
		const httpQuery = Client.query("HttpProject", "projects", "get", { interrupt: true })
		const httpLoader = Loader.fromQuery(httpQuery)
		const httpSettlement = Loader.settleQueryIf(
			httpQuery,
			httpQuery.init("request"),
			{ params: { id: "a" } },
			AsyncData.Success({ data: DateTime.toDateUtc(DateTime.nowUnsafe()) }),
			{ fresher: (incoming, current) => incoming > current }
		)
		expectTypeOf(httpSettlement).toEqualTypeOf<
			Update.Return<typeof httpQuery.Model.Type, typeof httpQuery.Message.Type>
		>()
		expectTypeOf(httpLoader.query).toEqualTypeOf<typeof httpQuery>()
		expectTypeOf(httpLoader.Load.Type).toEqualTypeOf<{
			readonly args: { readonly params: { readonly id: string } }
			readonly result: AsyncData.AsyncData<Date, Query.HttpApi.HttpApiClientError>
		}>()
		expectTypeOf(httpLoader.loadQuery({ params: { id: "a" } })).toEqualTypeOf<
			Effect.Effect<Loader.Envelope<typeof httpLoader.Load.Encoded>, Schema.SchemaError, Client>
		>()
		// @ts-expect-error HttpApi-derived Queries preserve required client services.
		void Effect.runPromise(httpLoader.loadQuery({ params: { id: "a" } }))
		// @ts-expect-error Interruptible Query definitions retain their instance-id requirement.
		httpLoader.query.init()
		httpLoader.query.init("request")
		const httpPlain = Loader.fromQuery(Client.query("HttpHome", "projects", "home"))
		expectTypeOf(httpPlain.loadQuery).toEqualTypeOf<
			Effect.Effect<Loader.Envelope<typeof httpPlain.Load.Encoded>, Schema.SchemaError, Client>
		>()

		const unrestricted = Query.define({
			name: "UnrestrictedTypes",
			args: { result: Schema.FiniteFromString, args: Schema.String },
			data: Schema.String,
			error: Schema.String,
			execute: ({ args }) => Effect.succeed(args),
		})
		const unrestrictedLoader = Loader.fromQuery(unrestricted)
		expectTypeOf(unrestrictedLoader.Load.Type).toEqualTypeOf<{
			readonly args: { readonly result: number; readonly args: string }
			readonly result: AsyncData.AsyncData<string, string>
		}>()
		expectTypeOf(unrestrictedLoader.Load.Encoded).toEqualTypeOf<{
			readonly args: { readonly result: string; readonly args: string }
			readonly result: AsyncData.AsyncDataEncoded<string, string>
		}>()
		Loader.fromQuery(unrestricted, {
			key({ result }) {
				expectTypeOf(result).toEqualTypeOf<number>()
				return String(result)
			},
		})

		const query = Query.define({
			name: "Home",
			data: Schema.String,
			error: Schema.String,
			execute: Effect.succeed("home"),
		})
		const homeLoader = Loader.fromQuery(query)
		expectTypeOf(homeLoader.Load.Type).toExtend<{ readonly result: unknown }>()
		expectTypeOf(homeLoader.Load.Type).not.toExtend<{ readonly id: string }>()
		expectTypeOf(keyedLoader.query).toEqualTypeOf<typeof keyed>()
		expectTypeOf(homeLoader.query).toEqualTypeOf<typeof query>()
		homeLoader.query.init()
		Loader.fromQuery(keyed, { key: ({ id }) => id })
		// @ts-expect-error Keys use decoded argument types.
		Loader.fromQuery(keyed, { key: ({ id }: { id: number }) => String(id) })
		// @ts-expect-error Keys must return strings.
		Loader.fromQuery(keyed, { key: () => 42 })
		// @ts-expect-error Resource identity uses args, not the fetched result.
		Loader.fromQuery(keyed, { key: ({ result }) => String(result) })
		// @ts-expect-error A plain Query has no arguments, so its identity is not overridable.
		Loader.fromQuery(query, { key: () => "home" })
		// @ts-expect-error Serialization is derived from the Query, not supplied by the caller.
		Loader.fromQuery(keyed, { data: Schema.Finite })
		// @ts-expect-error Bound keyed loads require the declared argument type.
		keyedLoader.loadQuery({ id: 1 })
		// @ts-expect-error Dual keyed loads require the declared argument type.
		Loader.loadQuery(keyedLoader, { id: 1 })
		// @ts-expect-error Plain Query loaders expose an Effect, not a callable keyed load.
		homeLoader.loadQuery({ id: "a" })
	}
})
