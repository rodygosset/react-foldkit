import { Schema } from "effect"

export const TodoItem = Schema.Struct({
	id: Schema.Finite,
	text: Schema.String,
	done: Schema.Boolean,
})

export type TodoItem = typeof TodoItem.Type
