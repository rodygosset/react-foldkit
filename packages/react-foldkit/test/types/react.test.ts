import { Context, Effect, Layer, Option, Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import type * as Update from "foldkit/update"
import React from "react"
import * as Application from "react-foldkit/application"
import { describe, expectTypeOf, it } from "vitest"

const Model = Schema.Struct({ count: Schema.Finite })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Increment: {} })
type Message = typeof Message.Type
const App = Application.define(
	{ Model, Message, update: (model: Model, _message: Message): Update.Return<Model, Message> => ({ model }) },
	{
		onReactivate: () => Message.Increment(),
	}
)

describe("React public types", function () {
	it("useInbound maps external values to the app Message", function () {
		expectTypeOf(App.useInbound<string>)
			.parameter(1)
			.toEqualTypeOf<(value: string) => Message>()
	})

	if (false) {
		Application.define(
			{ Model, Message, update: (model: Model, _message: Message) => ({ model }) },
			{
				// @ts-expect-error Reactivation must produce the application's Message.
				onReactivate: () => ({ _tag: "Other" }),
			}
		)

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

		const send = App.useSend()
		send.Increment()
		send(Message.Increment())
		// @ts-expect-error Send only has the union's tags.
		send.Other()
		// @ts-expect-error A consumer cannot widen the app's Message union through Send.
		send({ _tag: "Other" })

		const Fields = defineMessageUnion({ Set: { count: Schema.Finite }, Reset: {} })
		const WithFields = Application.define({
			Model,
			Message: Fields,
			update: (model: Model, _message: typeof Fields.Type) => ({ model }),
		})
		WithFields.useSend().Set({ count: 1 })
		WithFields.useSend().Reset()
		// @ts-expect-error Set requires its fields.
		WithFields.useSend().Set()
		// @ts-expect-error Field types follow the Message.
		WithFields.useSend().Set({ count: "1" })

		// @ts-expect-error An application needs its Message union.
		Application.define({ Model, update: (model: Model, _message: Message) => ({ model }) })
		Application.define({
			Model,
			Message: Fields,
			// @ts-expect-error The Message union must match update.
			update: (model: Model, _message: Message) => ({ model }),
		})
		// @ts-expect-error Without a config init, the Provider needs one.
		App.Provider({ children: null })
		const WithInit = Application.define({
			Model,
			Message,
			init: (): Update.Return<Model, Message> => ({ model: { count: 0 } }),
			update: (model: Model, _message: Message) => ({ model }),
		})
		WithInit.Provider({ children: null })

		const counter = { Model, Message, update: (model: Model, _message: Message) => ({ model }) }
		Application.define(counter, { retainInactive: "1 second", freezeModel: false })
		// @ts-expect-error React options go in the second argument, not the Program.
		Application.define({ ...counter, retainInactive: "1 second" })
		// @ts-expect-error Program fields go in the first argument, not the options.
		Application.define(counter, { init: () => ({ model: { count: 0 } }) })
	}
})

class Resource extends Context.Service<Resource, { readonly value: string }>()("ReactTypeTest/Resource") {}
declare const servicefulModel: Schema.Codec<Model, typeof Model.Encoded, Resource, Resource>

if (false) {
	const update = (model: Model, _message: Message): Update.Return<Model, Message, Resource> => ({ model })
	Application.define(
		{ Model, Message, update },
		{
			resources: Layer.succeed(Resource, { value: "ok" }),
		}
	)
	Application.define(
		{ Model, Message, update },
		{
			// @ts-expect-error The update's services must be provided.
			resources: Layer.empty,
		}
	)
	// @ts-expect-error Services cannot be omitted from the application options.
	Application.define({ Model, Message, update })
	// @ts-expect-error A Program that needs services requires the options argument.
	Application.define({ Model, Message, update }, {})
	const idle = (model: Model, _message: Message) => ({ model })
	const app = Application.define({ Model: servicefulModel, Message, update: idle })
	expectTypeOf(app.useModel()).toEqualTypeOf<Model>()
	// @ts-expect-error Update services must be provided even when the Model codec also needs them.
	Application.define({ Model: servicefulModel, Message, update })
}
