// Check the built public API using Foldkit's Vitest type-test convention.
import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import type * as Update from "foldkit/update"
import * as Program from "react-foldkit/program"
import * as Application from "react-foldkit/application"
import { define } from "react-foldkit/submodel"
import { describe, expectTypeOf, it } from "vitest"

const Model = Schema.Struct({ count: Schema.Finite })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Increment: {}, Set: { count: Schema.Finite } })
type Message = typeof Message.Type
const Other = defineMessageUnion({ Other: {} })

const init = (): Update.Return<Model, Message> => ({ model: { count: 0 } })
const update = (model: Model, _message: Message): Update.Return<Model, Message> => ({ model })

describe("Program public types", function () {
	it("keeps init required when the Program has one", function () {
		const program = Program.make({ Model, Message, init, update })
		expectTypeOf(program.init).toEqualTypeOf<() => Update.Return<Model, Message>>()
		expectTypeOf(Program.make({ Model, Message, update }).init).toEqualTypeOf<
			(() => Update.Return<Model, Message>) | undefined
		>()
	})

	if (false) {
		const program = Program.make({ Model, Message, init, update })
		const App = Application.define(program, { retainInactive: "1 second" })
		// The Program's init makes the Provider's init optional.
		App.Provider({ children: null })
		App.Provider({ init: { model: { count: 1 } }, children: null })

		const Bare = Application.define(Program.make({ Model, Message, update }))
		// @ts-expect-error Without a Program init, the Provider needs one.
		Bare.Provider({ children: null })

		// @ts-expect-error The Message union must match update.
		Program.make({ Model, Message: Other, update })
		// @ts-expect-error init must return the Program's Model.
		Program.make({ Model, Message, init: () => ({ model: { count: "zero" } }), update })

		const OutMessage = defineMessageUnion({ Changed: { count: Schema.Finite } })
		const child = Program.make({
			Model,
			Message,
			OutMessage,
			update: (model: Model, _message: Message) => ({ model, outMessage: OutMessage.Changed({ count: 1 }) }),
		})
		define(child).useSend().Set({ count: 1 })
		// @ts-expect-error A child Program reports OutMessages, so it cannot own a Store.
		Application.define(child)
	}
})
