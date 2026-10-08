import { Context, Effect, Layer, Result, Scope } from "effect"
import * as Store from "react-foldkit/store"
import { describe, expectTypeOf, it } from "vitest"

type Model = { readonly count: number }
type Message = { readonly _tag: "Increment" }
declare const store: Store.Store<Model, Message>

describe("Store public types", function () {
	it("commit preserves the Message and typed failure", function () {
		expectTypeOf<Store.Store<Model, Message>["commit"]>().toEqualTypeOf<
			(message: Message) => Result.Result<void, Store.CommitError>
		>()
		expectTypeOf(Store.commit<Model, Message>).returns.toEqualTypeOf<Effect.Effect<void, Store.CommitError>>()
	})

	it("constructs a typed store Effect while providing command services through the config", function () {
		class Service extends Context.Service<Service, { readonly value: number }>()("StoreTest/Service") {}
		const update = (model: Model, _message: Message) => ({
			model,
			commands: [{ name: "Read", effect: Effect.as(Service, { _tag: "Increment" } as const) }],
		})
		const layer = Layer.succeed(Service, { value: 1 })
		// Store.make allocates in the caller's Scope, so a host closes it to dispose the store.
		expectTypeOf(Store.make({ update, layer }, { model: { count: 0 } })).toEqualTypeOf<
			Effect.Effect<Store.Store<Model, Message>, never, Scope.Scope>
		>()
		expectTypeOf(Store.make({ update }, { model: { count: 0 } })).toEqualTypeOf<
			Effect.Effect<Store.Store<Model, Message>, never, Service | Scope.Scope>
		>()
		if (false) {
			// @ts-expect-error Ambient services must be provided before execution.
			Effect.runSync(Effect.scoped(Store.make({ update }, { model: { count: 0 } })))
			// @ts-expect-error An empty Layer cannot satisfy required Command services.
			Store.make({ update, layer: Layer.empty }, { model: { count: 0 } })
		}
	})

	if (false) {
		// @ts-expect-error The host store retains its Message type.
		store.commit({ _tag: "Other" })
		// @ts-expect-error The data-last adapter retains the store Message type.
		Store.commit({ _tag: "Other" })(store)
		// @ts-expect-error Crash data is mandatory.
		new Store.CommitError({ details: { reason: "Crashed" } })
		// @ts-expect-error The Effect adapter must not widen Message inference from the store.
		Store.commit(store, { _tag: "Other" })
	}
})
