import { Schema } from "effect"
import { type CallableTaggedStruct, makeCallable } from "./schema"

export type Message<Tag extends string, Fields extends Schema.Struct.Fields = {}> = CallableTaggedStruct<Tag, Fields>

export function make<Tag extends string>(tag: Tag): Message<Tag>
export function make<Tag extends string, Fields extends Schema.Struct.Fields>(
	tag: Tag,
	fields: Fields
): Message<Tag, Fields>
export function make(tag: string, fields: Schema.Struct.Fields = {}): any {
	return makeCallable(Schema.TaggedStruct(tag, fields))
}
