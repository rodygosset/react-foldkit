import { Option, Schema } from "effect"

export const Notice = Schema.Struct({
	id: Schema.String,
	headline: Schema.String,
	body: Schema.String,
})
export type Notice = typeof Notice.Type

export const Model = Schema.Struct({
	notice: Schema.Option(Notice),
})
export type Model = typeof Model.Type

export const empty = (): Model => ({
	notice: Option.none(),
})
