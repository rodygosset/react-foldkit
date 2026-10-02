import { Context, Effect, Schema } from "effect"
import * as AsyncData from "react-foldkit/asyncData"
import * as Query from "react-foldkit/query"
import type * as Update from "react-foldkit/update"
import { describe, expectTypeOf, it } from "vitest"

class Api extends Context.Service<Api, { readonly load: Effect.Effect<Date, string> }>()("QueryTypes/Api") {}
const single = Query.define({
	name: "PublicSettle",
	data: Schema.DateFromString,
	error: Schema.String,
	interrupt: true,
	execute: Effect.flatMap(Api, (api) => api.load),
})
const keyed = Query.define({
	name: "PublicKeyedSettle",
	args: { id: Schema.Number },
	data: Schema.DateFromString,
	error: Schema.String,
	execute: () => Effect.flatMap(Api, (api) => api.load),
})
type Parent = { readonly data: typeof keyed.Model.Type }
type Message = { readonly _tag: "GotQuery"; readonly message: typeof keyed.Message.Type }
const lifted = keyed.lift<Parent, Message>({
	field: "data",
	toParentMessage: (message) => ({ _tag: "GotQuery", message }),
})
declare const result: AsyncData.AsyncData<Date, string>
declare const parent: Parent

describe("Query settlement public types", () => {
	it("accepts Query.run's existing type and exposes service-free Update steps", () => {
		expectTypeOf(single.run).toEqualTypeOf<Effect.Effect<AsyncData.AsyncData<Date, string>, never, Api>>()
		expectTypeOf(single.settle).toEqualTypeOf<
			Update.Fold<typeof single.Model.Type, typeof single.Message.Type, AsyncData.AsyncData<Date, string>>
		>()
		expectTypeOf(keyed.settle({ id: 1 }, AsyncData.Loading())).toEqualTypeOf<
			Update.Step<typeof keyed.Model.Type, typeof keyed.Message.Type>
		>()
		expectTypeOf(lifted).toExtend<
			Query.Lifted.KeyedQuery<Parent, Message, typeof keyed.Message.Type, { readonly id: number }, Api>
		>()
		expectTypeOf(lifted.settle({ id: 1 }, AsyncData.Loading())).toEqualTypeOf<Update.Step<Parent, Message>>()
		expectTypeOf(single.Model.fields.data).toExtend<Schema.Codec<AsyncData.AsyncData<Date, string>, unknown>>()
		expectTypeOf(keyed.Model.fields.slots.value.fields.data).toExtend<
			Schema.Codec<AsyncData.AsyncData<Date, string>, unknown>
		>()
	})

	if (false) {
		const settled: Update.Return<typeof single.Model.Type, typeof single.Message.Type> = single.settle(
			single.init("a"),
			result
		)
		const keyedSettled: Update.Return<typeof keyed.Model.Type, typeof keyed.Message.Type> = keyed.settle(
			keyed.init("a"),
			{ id: 1 },
			result
		)
		const liftedSettled: Update.Return<Parent, Message> = lifted.settle(parent, { id: 1 }, result)
		void [settled, keyedSettled, liftedSettled]
		// @ts-expect-error Settlement accepts decoded data, not the codec's encoded string.
		single.settle(single.init("a"), AsyncData.Success({ data: "2026-10-01" }))
		// @ts-expect-error Error types remain exact across the lifted API.
		lifted.settle(parent, { id: 1 }, AsyncData.Failure({ error: 123 }))
		// @ts-expect-error Keyed settlement retains the Query args.
		keyed.settle(keyed.init("a"), { id: "1" }, result)
		// @ts-expect-error Interrupts target a specific request.
		single.Fetch.Interrupt({ instanceId: "a" }, (outcome) => outcome)
	}
})
