import { Result, Schema } from "effect"

export const parse = (schema, text) =>
	Result.getOrThrow(Schema.decodeUnknownResult(Schema.fromJsonString(schema))(text))
export const stringify = (value, _replacer, space) =>
	Result.getOrThrow(Schema.encodeResult(Schema.fromJsonString(Schema.Unknown, { space }))(value))
