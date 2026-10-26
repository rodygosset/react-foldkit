import { Effect, Schema } from "effect"
import * as Command from "foldkit/command"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"
import type * as Update from "foldkit/update"
import * as Program from "react-foldkit/program"

export const Model = Schema.Struct({
	count: Schema.Finite,
	isWaiting: Schema.Boolean,
	// The diagram reads these to show each Message going around the loop.
	lastMessage: Schema.String,
	messageCount: Schema.Finite,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
	ClickedIncrement: {},
	ClickedDelayedIncrement: {},
	CompletedDelay: {},
	ClickedReset: {},
})
export type Message = typeof Message.Type

// The delay is a side effect, so it runs as a Command, outside React.
const WaitToIncrement = Command.define("WaitToIncrement", {
	messages: [Message.CompletedDelay],
	execute: Effect.sleep("1 second").pipe(
		Effect.as(Message.CompletedDelay())
	),
})

function update(model: Model, message: Message) {
	const next = modifyFields(model, {
		lastMessage: () => message._tag,
		messageCount: (count) => count + 1,
	})

	return Message.match<Update.Return<Model, Message>>(message, {
		ClickedIncrement: () => ({
			model: modifyFields(next, { count: (count) => count + 1 }),
		}),
		ClickedDelayedIncrement: () =>
			model.isWaiting
				? { model: next }
				: {
						model: modifyFields(next, { isWaiting: () => true }),
						commands: [WaitToIncrement()],
					},
		CompletedDelay: () => ({
			model: modifyFields(next, {
				count: (count) => count + 1,
				isWaiting: () => false,
			}),
		}),
		ClickedReset: () => ({
			model: modifyFields(next, { count: () => 0 }),
		}),
	})
}

const init = () => ({
	model: { count: 0, isWaiting: false, lastMessage: "", messageCount: 0 },
})

export const counter = Program.make({ Model, Message, init, update })
