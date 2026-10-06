import { Array, Order, Predicate, Record, Result, Schema, pipe } from "effect"

const entryOrder = Order.mapInput(Order.String, ([key]: readonly [string, Schema.Json]) => key)
const canonicalizeEntry = ([key, value]: readonly [string, Schema.Json]): readonly [string, Schema.Json] => [
	key,
	canonicalizeJson(value),
]

const isJsonObject = (value: Schema.Json): value is Schema.JsonObject =>
	Predicate.isObject(value) && !globalThis.Array.isArray(value)

function canonicalizeJson(value: Schema.Json): Schema.Json {
	if (globalThis.Array.isArray(value)) return Array.map(value, canonicalizeJson)
	if (isJsonObject(value))
		return pipe(value, Record.toEntries, Array.sort(entryOrder), Array.map(canonicalizeEntry), Record.fromEntries)

	return value
}

export type ReadKey<A> = (data: A) => Result.Result<string, Schema.SchemaError>

const encodeJson = Schema.encodeResult(Schema.fromJsonString(Schema.Json))

/** Canonical identity uses encoded arguments, never the fetched outcome. */
export function makeResourceKey<A, I>(Args: Schema.Codec<A, I>): ReadKey<A> {
	const encodeArgs = Schema.encodeResult(Schema.toCodecJson(Args))
	return (args) => Result.flatMap(encodeArgs(args), (json) => encodeJson(canonicalizeJson(json)))
}
