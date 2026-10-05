import { Effect, Result } from "effect"
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

	if (false) {
		// @ts-expect-error The host store retains its Message type.
		store.commit({ _tag: "Other" })
		// @ts-expect-error The Effect adapter must not widen Message inference from the store.
		Store.commit(store, { _tag: "Other" })
	}
})
