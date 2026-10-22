// Check the built public API using Foldkit's Vitest type-test convention.
import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import type * as Update from "foldkit/update"
import * as Program from "react-foldkit/program"
import * as Application from "react-foldkit/application"
import * as Store from "react-foldkit/store"
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
		const untagged = {
			Model: Schema.Finite,
			Message: Schema.Finite,
			update: (model: number, _message: number) => ({ model }),
		}
		// @ts-expect-error Messages must have a string _tag.
		Program.make(untagged)
		// @ts-expect-error Application Messages must be tagged.
		Application.define(untagged)
		// @ts-expect-error Submodel Messages must be tagged.
		define({ Model: Schema.Finite, Message: Schema.Finite })
		// @ts-expect-error Effect Store Messages must be tagged.
		Store.make({ update: untagged.update }, { model: 0 })
		// @ts-expect-error Booted Store Messages must be tagged.
		Store.boot({ update: untagged.update }, { model: 0 })
		// @ts-expect-error An untagged object is not a Message.
		Program.make({ Model, Message: Schema.Struct({ value: Schema.Finite }), update: (model: Model) => ({ model }) })
		Application.define({
			Model,
			// @ts-expect-error _tag must be a string.
			Message: Schema.Struct({ _tag: Schema.Finite }),
			update: (model: Model) => ({ model }),
		})
		Application.define(
			{ Model, Message, update },
			{
				// @ts-expect-error DevTools cannot dispatch Messages from a different Schema.
				devTools: { Message: Schema.Finite },
			}
		)
		Application.define(
			{ Model, Message, update },
			{
				// @ts-expect-error A different tagged union is also invalid for DevTools dispatch.
				devTools: { Message: Other },
			}
		)
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
