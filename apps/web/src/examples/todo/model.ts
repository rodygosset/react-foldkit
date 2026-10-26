import { Effect, Schema } from "effect"

export const TodoItem = Schema.Struct({
	id: Schema.Finite,
	text: Schema.String,
	done: Schema.Boolean,
})
export type TodoItem = typeof TodoItem.Type

export const Filter = Schema.Literals(["all", "active", "completed"])
export type Filter = typeof Filter.Type

/** The `/examples/todo` route search. A URL without a filter shows every todo. */
export const TodoSearch = Schema.Struct({
	filter: Filter.pipe(Schema.withDecodingDefaultKey(Effect.succeed<Filter>("all"))),
})
export type TodoSearch = typeof TodoSearch.Type
