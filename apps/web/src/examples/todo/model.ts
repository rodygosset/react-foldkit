import { Schema } from "effect"

export const TodoItem = Schema.Struct({
	id: Schema.Finite,
	text: Schema.String,
	done: Schema.Boolean,
})
export type TodoItem = typeof TodoItem.Type

export const Filter = Schema.Literals(["all", "active", "completed"])
export type Filter = typeof Filter.Type

/** The `/todo` route search. */
export const TodoSearch = Schema.Struct({
	filter: Filter,
})
export type TodoSearch = typeof TodoSearch.Type
