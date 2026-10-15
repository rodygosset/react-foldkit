import React from "react"
import { Context, Effect, Layer, Option, Result, Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import { defineApplication, type CommitEntry, type CommitSource } from "react-foldkit/react"
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
declare const source: CommitSource<Message>
declare const foreign: CommitSource<{ readonly _tag: "Other" }>

describe("React public types", function () {
	it("useInbound maps external values to the app Message", function () {
		expectTypeOf(App.useInbound<string>)
			.parameter(1)
			.toEqualTypeOf<(value: string) => Message>()
	})

	it("Provider commitSource binds to the app Message", function () {
		expectTypeOf<CommitEntry<Message>["version"]>().toEqualTypeOf<string | number>()
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

		App.Provider({ init: { model: { count: 0 } }, commitSource: source, children: null })
		App.Provider({
			init: { model: { count: 0 } },
			createCommitSource: () => Result.succeed(source),
			children: null,
		})
		expectTypeOf(App.useOptionalModel()).toEqualTypeOf<Option.Option<Model>>()
		// @ts-expect-error A Provider has one source owner.
		App.Provider({
			init: { model: { count: 0 } },
			commitSource: source,
			createCommitSource: () => Result.succeed(source),
			children: null,
		})
		App.Provider({
			init: { model: { count: 0 } },
			// @ts-expect-error Factory sources must contain the application's Messages.
			createCommitSource: () => Result.succeed(foreign),
			children: null,
		})
		// @ts-expect-error A factory returns a Result, preserving construction errors.
		App.Provider({ init: { model: { count: 0 } }, createCommitSource: () => source, children: null })
		const typed: CommitSource<Message, string> = {
			getSnapshot: () => Result.fail("failed"),
			subscribe: () => function () {},
		}
		App.Provider({ init: { model: { count: 0 } }, createCommitSource: () => Result.succeed(typed), children: null })
		// @ts-expect-error Provider sources must contain the app's own Messages.
		App.Provider({ init: { model: { count: 0 } }, commitSource: foreign, children: null })
		// @ts-expect-error A consumer cannot widen the app's Message union.
		App.useDispatch()({ _tag: "Other" })
		// @ts-expect-error Commit is not part of the React API; use Store.commit outside React.
		App.useCommit
		// @ts-expect-error Manual useCommitSource is not part of the public API.
		App.useCommitSource
		const numericKey: CommitEntry<Message> = {
			// @ts-expect-error Entry keys are strings.
			key: 1,
			version: 1,
			message: Message.Increment(),
		}
		const asynchronous: CommitSource<Message> = {
			// @ts-expect-error Snapshots must be synchronously readable.
			getSnapshot: () => Promise.resolve([]),
			// @ts-expect-error Subscription setup must synchronously return cleanup.
			subscribe: () => Promise.resolve(function () {}),
		}
		const entry: CommitEntry<Message> = {
			key: "count",
			// @ts-expect-error Object identity is not a published version.
			version: {},
			message: Message.Increment(),
		}
		void [numericKey, asynchronous, entry]
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
