import { Schema, Types } from "effect"

/** A `TaggedStruct` schema that can be called directly as a constructor: `Foo({ count: 1 })` instead of `Foo.make({ count: 1 })`. */
export type CallableTaggedStruct<Tag extends string, Fields extends Schema.Struct.Fields> = Schema.TaggedStruct<
	Tag,
	Fields
> &
	(keyof Fields extends never
		? (
				value?: Parameters<Schema.TaggedStruct<Tag, Fields>["make"]>[0] | void
			) => Types.Simplify<Schema.Struct.Type<{ readonly _tag: Schema.tag<Tag> } & Fields>>
		: (
				value: Parameters<Schema.TaggedStruct<Tag, Fields>["make"]>[0]
			) => Types.Simplify<Schema.Struct.Type<{ readonly _tag: Schema.tag<Tag> } & Fields>>)

export const makeCallable = <Tag extends string, Fields extends Schema.Struct.Fields>(
	schema: Schema.TaggedStruct<Tag, Fields>
): CallableTaggedStruct<Tag, Fields> =>
	/* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
	new Proxy(function () {} as unknown as object, {
		apply(_target, _thisArg, argumentsList) {
			return schema.make(argumentsList[0] ?? {})
		},
		get(_target, property, receiver) {
			return Reflect.get(schema, property, receiver)
		},
		has(_target, property) {
			return Reflect.has(schema, property)
		},
		getPrototypeOf() {
			return Reflect.getPrototypeOf(schema)
		},
	}) as unknown as CallableTaggedStruct<Tag, Fields>
