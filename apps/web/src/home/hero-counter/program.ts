import { Effect, Schema } from "effect"
import * as Command from "foldkit/command"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"
import type * as Update from "foldkit/update"
import * as Program from "react-foldkit/program"

const Model = Schema.Struct({
	count: Schema.Finite,
	isWaiting: Schema.Boolean,
})
type Model = typeof Model.Type

const Message = defineMessageUnion({
	ClickedIncrement: {},
	ClickedDelayedIncrement: {},
	CompletedDelay: {},
	ClickedReset: {},
})
type Message = typeof Message.Type

// The delay is a side effect, so it runs as a Command, outside React.
const WaitToIncrement = Command.define("WaitToIncrement", {
	messages: [Message.CompletedDelay],
	execute: Effect.sleep("1 second").pipe(Effect.as(Message.CompletedDelay())),
})

const update = (model: Model, message: Message) =>
	Message.match<Update.Return<Model, Message>>(message, {
		ClickedIncrement: () => ({
			model: modifyFields(model, { count: (count) => count + 1 }),
		}),
		ClickedDelayedIncrement: () =>
			model.isWaiting
				? { model }
				: {
						model: modifyFields(model, { isWaiting: () => true }),
						commands: [WaitToIncrement()],
					},
		CompletedDelay: () => ({
			model: modifyFields(model, {
				count: (count) => count + 1,
				isWaiting: () => false,
			}),
		}),
		ClickedReset: () => ({ model: modifyFields(model, { count: () => 0 }) }),
	})

const init = () => ({ model: { count: 0, isWaiting: false } })

export const counter = Program.make({ Model, Message, init, update })
