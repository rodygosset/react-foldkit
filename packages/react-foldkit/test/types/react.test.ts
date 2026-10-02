// Check the emitted public exports independently of source files and router augmentation.
import { Context, Layer, Result, Schema } from "effect"
import { defineMessageUnion } from "react-foldkit/message"
import { defineApplication, type CommitEntry, type CommitSource, type CommitSourceOptions } from "react-foldkit/react"
import type { CommitError } from "react-foldkit/store"
import type * as Update from "react-foldkit/update"
import { describe, expectTypeOf, it } from "vitest"

const Model = Schema.Struct({ count: Schema.Number })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Increment: {} })
type Message = typeof Message.Type
const App = defineApplication({
	Model,
	update: (model: Model, _message: Message): Update.Return<Model, Message> => ({ model }),
})
declare const commit: ReturnType<typeof App.useCommit>
declare const source: CommitSource<Message>
declare const foreign: CommitSource<{ readonly _tag: "Other" }>

describe("React public types", () => {
	it("useCommit preserves the Message and typed failure", () => {
		expectTypeOf(App.useCommit).returns.toEqualTypeOf<(message: Message) => Result.Result<void, CommitError>>()
	})

	it("useCommitSource binds the source and baseline to the app Message", () => {
		expectTypeOf(App.useCommitSource).toEqualTypeOf<(options: CommitSourceOptions<Message>) => void>()
		expectTypeOf<CommitEntry<Message>["version"]>().toEqualTypeOf<string | number>()
	})

	// Foldkit uses unreachable blocks for compile-only calls that must not execute.
	if (false) {
		App.Provider({ init: { model: { count: 0 } }, children: null })
		App.Provider({ init: { model: { count: 0 } }, commitSource: source, children: null })
		// @ts-expect-error Provider sources must contain the app's own Messages.
		App.Provider({ init: { model: { count: 0 } }, commitSource: foreign, children: null })
		// @ts-expect-error A consumer cannot widen the app's Message union.
		commit({ _tag: "Other" })
		// @ts-expect-error The bound source hook cannot widen the app Message union.
		App.useCommitSource({ source: foreign, initialSnapshot: [] })
		// @ts-expect-error The baseline must contain the app's own Messages.
		App.useCommitSource({ source, initialSnapshot: foreign.getSnapshot() })
		const numericKey: CommitEntry<Message> = {
			// @ts-expect-error Entry keys are strings.
			key: 1,
			version: 1,
			message: Message.Increment(),
		}
		const asynchronous: CommitSource<Message> = {
			// @ts-expect-error Snapshots must be synchronously readable.
			getSnapshot: async () => [],
			// @ts-expect-error Subscription setup must synchronously return cleanup.
			subscribe: async () => () => {},
		}
		const entry: CommitEntry<Message> = {
			key: "count",
			// @ts-expect-error Object identity is not a published version.
			version: {},
			message: Message.Increment(),
		}
	}
})

class Resource extends Context.Service<Resource, { readonly value: string }>()("ReactTypeTest/Resource") {}
declare const servicefulModel: Schema.Codec<Model, typeof Model.Encoded, Resource, Resource>

// Configuration constraints belong in compile-only tests of the emitted API.
if (false) {
	const update = (model: Model, _message: Message): Update.Return<Model, Message, Resource> => ({ model })
	defineApplication({ Model, update, layer: Layer.succeed(Resource, { value: "ok" }) })
	// @ts-expect-error The update's services must be provided.
	defineApplication({ Model, update, layer: Layer.empty })
	// @ts-expect-error Services cannot be omitted from the application config.
	defineApplication({ Model, update })
	const idle = (model: Model, _message: Message) => ({ model })
	const app = defineApplication({
		Model: servicefulModel,
		update: idle,
		layer: Layer.succeed(Resource, { value: "ok" }),
	})
	expectTypeOf(app.useModel()).toEqualTypeOf<Model>()
	// @ts-expect-error Codec services also require a Layer.
	defineApplication({ Model: servicefulModel, update: idle })
}
