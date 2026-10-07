import { Context, Effect, Schema } from "effect"
import * as Query from "foldkit/experimental/query"
import * as AsyncData from "react-foldkit/asyncData"
import * as Loader from "react-foldkit/loader"
import type * as Update from "react-foldkit/update"
import { describe, expectTypeOf, it } from "vitest"

class Api extends Context.Service<Api, { readonly load: Effect.Effect<Date, string> }>()("QueryTypes/Api") {}
const keyed = Query.define({
	name: "PublicKeyedLoad",
	args: { id: Schema.FiniteFromString },
	data: Schema.DateFromString,
	error: Schema.String,
	interrupt: true,
	execute: () => Effect.flatMap(Api, (api) => api.load),
})

describe("Foldkit Query Loader public types", function () {
	it("preserves decoded values, keyed args, and fetch services across the adapter", function () {
		const loader = Loader.fromQuery(keyed)
		expectTypeOf(loader.Load.Type).toExtend<{
			readonly args: { readonly id: number }
			readonly result: AsyncData.AsyncData<Date, string>
		}>()
		expectTypeOf(loader.loadQuery({ id: 1 })).toExtend<
			Effect.Effect<Loader.Envelope<unknown>, Schema.SchemaError, Api>
		>()
		expectTypeOf(loader.Load.Encoded).toEqualTypeOf<{
			readonly args: { readonly id: string }
			readonly result: AsyncData.AsyncDataEncoded<string, string>
		}>()
		expectTypeOf(loader.query).toEqualTypeOf<typeof keyed>()
		const program = loader.loadQuery({ id: 1 })
		expectTypeOf(Loader.loadQuery(loader, { id: 1 })).toEqualTypeOf<typeof program>()
		expectTypeOf(loader.pipe(Loader.loadQuery({ id: 1 }))).toEqualTypeOf<typeof program>()
		Loader.fromQuery(keyed, {
			key({ id }) {
				expectTypeOf(id).toEqualTypeOf<number>()
				return String(id)
			},
		})
		const settled = Loader.settleQueryIf(
			keyed,
			keyed.init("types"),
			{ id: 1 },
			AsyncData.Success({ data: new Date() }),
			{
				fresher: (incoming, current) => incoming > current,
			}
		)
		expectTypeOf(settled).toEqualTypeOf<Update.Return<typeof keyed.Model.Type, typeof keyed.Message.Type>>()
	})

	if (false) {
		// @ts-expect-error Loader settlement accepts decoded Dates, not encoded strings.
		Loader.settleQueryIf(keyed, keyed.init("types"), { id: 1 }, AsyncData.Success({ data: "2026-10-01" }), {
			fresher: () => true,
		})
		// @ts-expect-error Keyed settlement retains the Query args.
		Loader.settleQueryIf(keyed, keyed.init("types"), { id: "1" }, AsyncData.Success({ data: new Date() }), {
			fresher: () => true,
		})
	}
})
