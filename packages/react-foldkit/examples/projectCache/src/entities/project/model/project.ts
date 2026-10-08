import { Schema } from "effect"

export const Project = Schema.Struct({
	id: Schema.String,
	revision: Schema.Finite,
	name: Schema.String,
	description: Schema.String,
})
export type Project = typeof Project.Type
