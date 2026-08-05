import { Schema } from "effect"

export const Filter = Schema.Literals(["all", "active", "completed"])
export type Filter = typeof Filter.Type

export const TodoSearch = Schema.Struct({
	filter: Filter,
})
export type TodoSearch = typeof TodoSearch.Type
