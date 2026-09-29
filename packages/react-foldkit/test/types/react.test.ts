import React from "react"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import { defineApplication } from "react-foldkit/react"
import type * as Update from "foldkit/update"
import { describe, expectTypeOf, it } from "vitest"

const Model = Schema.Struct({ count: Schema.Finite })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Increment: {} })
type Message = typeof Message.Type
const App = defineApplication({
	Model,
	onReactivate: () => Message.Increment(),
	update: (model: Model, _message: Message): Update.Return<Model, Message> => ({ model }),
})

describe("React public types", function () {
	it("useInbound maps external values to the app Message", function () {
		expectTypeOf(App.useInbound<string>)
			.parameter(1)
			.toEqualTypeOf<(value: string) => Message>()
	})

	if (false) {
		defineApplication({
			Model,
			update: (model: Model, _message: Message) => ({ model }),
			// @ts-expect-error Reactivation must produce the application's Message.
			onReactivate: () => ({ _tag: "Other" }),
		})

		App.Provider({ init: { model: { count: 0 } }, children: null })
		App.Provider({ init: () => ({ model: { count: 0 } }), children: null })
		App.Provider({
			init: { model: { count: 0 } },
			children: null,
			crash: {
				report: () => Effect.fail("observer failure"),
				view: ({ restart }) => React.createElement("button", { onClick: restart }),
			},
		})
		App.Provider({
			init: { model: { count: 0 } },
			children: null,
			crash: { report: () => Effect.sleep("1 millis") },
		})

		expectTypeOf(App.useOptionalModel()).toEqualTypeOf<Option.Option<Model>>()
		// @ts-expect-error Providers do not accept external Message sources.
		App.Provider({ init: { model: { count: 0 } }, commitSource: {}, children: null })
		// @ts-expect-error A consumer cannot widen the app's Message union.
		App.useDispatch()({ _tag: "Other" })
		// @ts-expect-error Commit is not part of the React API; use Store.commit outside React.
		App.useCommit
	}
})

class Resource extends Context.Service<Resource, { readonly value: string }>()("ReactTypeTest/Resource") {}
declare const servicefulModel: Schema.Codec<Model, typeof Model.Encoded, Resource, Resource>

if (false) {
	const update = (model: Model, _message: Message): Update.Return<Model, Message, Resource> => ({ model })
	defineApplication({ Model, update, resources: Layer.succeed(Resource, { value: "ok" }) })
	// @ts-expect-error The update's services must be provided.
	defineApplication({ Model, update, resources: Layer.empty })
	// @ts-expect-error Services cannot be omitted from the application config.
	defineApplication({ Model, update })
	const idle = (model: Model, _message: Message) => ({ model })
	const app = defineApplication({
		Model: servicefulModel,
		update: idle,
	})
	expectTypeOf(app.useModel()).toEqualTypeOf<Model>()
	// @ts-expect-error Update services must be provided even when the Model codec also needs them.
	defineApplication({ Model: servicefulModel, update })
}
