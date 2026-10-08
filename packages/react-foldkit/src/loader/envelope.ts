import { Schema } from "effect"

/**
 * Schema for the identity attached to a loaded result.
 *
 * Router adapters use the name, key, and version to track which results they have delivered.
 * A version identifies one loading execution. It does not say how fresh the data is.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Receipt = Schema.Struct({
	name: Schema.String,
	key: Schema.String,
	version: Schema.String,
})
/**
 * The identity of a loaded result, used by router adapters to avoid repeated delivery.
 * `name` identifies the Loader declaration, `key` identifies the resource, and `version`
 * identifies one loading execution. Compare revisions in your data to decide freshness.
 *
 * @category models
 * @since 0.1.0
 */
export type Receipt = typeof Receipt.Type

export const EnvelopeHeader = Schema.TaggedStruct("react-foldkit/Loader", {
	format: Schema.Literal(1),
	...Receipt.fields,
})

export const Envelope = <S extends Schema.Codec<unknown, unknown>>(schema: S) =>
	Schema.Struct({
		...EnvelopeHeader.fields,
		payload: schema,
	})

/**
 * The encoded result returned by a Loader's loading Effect.
 * Return it as route loader data so a router adapter can turn the result into an application
 * Message. It contains the encoded payload and the identity used to track its delivery.
 *
 * The matching declaration checks the format, name, payload, and resource key before decoding.
 *
 * @category models
 * @since 0.1.0
 */
export type Envelope<I = unknown> = ReturnType<typeof Envelope<Schema.Codec<unknown, I>>>["Encoded"]
