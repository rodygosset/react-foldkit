import { Schema } from "effect"

/** Delivery identity, independent of the resource's authoritative revision. */
export const Receipt = Schema.Struct({ name: Schema.String, key: Schema.String, version: Schema.String })
export type Receipt = typeof Receipt.Type

export const EnvelopeHeader = Schema.Struct({
	_tag: Schema.Literal("react-foldkit/Loader"),
	format: Schema.Literal(1),
	...Receipt.fields,
})

/** Versioned wire format; payloads use the declaration's Codec. */
export const Envelope = <S extends Schema.Codec<unknown, unknown>>(schema: S) =>
	Schema.Struct({ ...EnvelopeHeader.fields, payload: schema })

export type Envelope<I = unknown> = ReturnType<typeof Envelope<Schema.Codec<unknown, I>>>["Encoded"]
