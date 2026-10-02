import { Effect, Function, Pipeable, Schema } from "effect"
import type * as AsyncData from "./asyncData"
import { Envelope, EnvelopeHeader, Receipt } from "./internal/loader-envelope"
import type { KeyedArgs } from "./query/internal"
import type { KeyedQuery, SyncFields } from "./query/keyedQuery"
import type { Query } from "./query/query"

export { Receipt } from "./internal/loader-envelope"
export type { Envelope } from "./internal/loader-envelope"

/** The adapter-facing part of a declaration; heterogeneous payloads stay private. */
export interface Declaration<out Message> extends Pipeable.Pipeable {
	readonly name: string
	readonly decode: (envelope: unknown) => Message
}

/** A typed loading program and its mapping into external Messages. */
export interface Loader<A, I, out Message = A> extends Declaration<Message> {
	readonly data: Schema.Codec<A, I>
	readonly key: (data: A) => string
	readonly load: <E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<Envelope<I>, E | Schema.SchemaError, R>
}

export interface Config<A, I> {
	readonly name: string
	readonly data: Schema.Codec<A, I>
	readonly key: (data: NoInfer<A>) => string
}

class LoaderImpl<A, I, Message> extends Pipeable.Class implements Loader<A, I, Message> {
	readonly decode: (envelope: unknown) => Message

	constructor(
		readonly name: string,
		readonly data: Schema.Codec<A, I>,
		readonly key: (data: A) => string,
		readonly toMessage: (data: A, receipt: Receipt) => Message,
		readonly load: Loader<A, I, Message>["load"]
	) {
		super()
		const decode = Schema.decodeUnknownSync(
			Envelope(data)
				.pipe(Schema.fieldsAssign({ name: Schema.Literal(name) }))
				.check(
					Schema.makeFilter(
						function (envelope) {
							return key(envelope.payload) === envelope.key
						},
						{
							message: "Loader resource key does not match its payload",
						}
					)
				)
		)
		this.decode = function (input) {
			const { name, key, version, payload } = decode(input)
			return toMessage(payload, { name, key, version })
		}
	}
}

function encodeLoad<A, I>(
	config: Config<A, I>,
	encode: (data: A) => Effect.Effect<I, Schema.SchemaError>
): Loader<A, I>["load"] {
	return function (effect) {
		return Effect.flatMap(effect, function (data) {
			return Effect.map(encode(data), function (payload) {
				return {
					_tag: EnvelopeHeader.fields._tag.literal,
					format: EnvelopeHeader.fields.format.literal,
					name: config.name,
					key: config.key(data),
					version: crypto.randomUUID(),
					payload,
				}
			})
		})
	}
}

/** Declares a serializable payload without running its loading Effect. */
export function define<A, I>(config: Config<A, I>): Loader<A, I> {
	const encode = Schema.encodeEffect(config.data)
	return new LoaderImpl(config.name, config.data, config.key, Function.identity, encodeLoad(config, encode))
}

type KeyedQueryForLoader<Name extends string, A, AI, E, EI, Fields extends SyncFields, R> = KeyedQuery<
	Name,
	A,
	AI,
	E,
	EI,
	Fields,
	R,
	boolean
> & {
	readonly name: Name
	readonly Args: Schema.Struct<Fields>
	readonly toKey: (args: KeyedArgs<Fields>) => string
}

type KeyedLoadType<Fields extends SyncFields, A, E> = KeyedArgs<Fields> & {
	readonly result: AsyncData.AsyncData<A, E>
}

export interface QueryLoader<A, I, LoadSchema extends Schema.Top> extends Loader<A, I> {
	readonly Load: LoadSchema
}

/** Derives a Loader Schema and resource key from a keyed Query. */
export function defineFromQuery<Name extends string, A, AI, E, EI, Fields extends SyncFields, R>(
	query: KeyedQueryForLoader<Name, A, AI, E, EI, Fields, R>,
	options?: {
		readonly key?: (load: KeyedLoadType<Fields, A, E>) => string
	}
) {
	const resultSchema = query.Model.fields.slots.value.fields.data
	const Load = Schema.Struct({
		...query.Args.fields,
		result: resultSchema,
	})
	const key =
		options?.key ??
		function (load: KeyedLoadType<Fields, A, E>) {
			const args = { ...load } as Record<string, unknown>
			delete args.result
			return query.toKey(args as KeyedArgs<Fields>)
		}
	const loader = define({
		name: query.name,
		data: Load as Schema.Codec<KeyedLoadType<Fields, A, E>, typeof Load.Encoded>,
		key,
	})
	return Object.assign(loader, { Load })
}

type SingleQueryForLoader<Name extends string, A, AI, E, EI, R> = Query<Name, A, AI, E, EI, R, boolean> & {
	readonly name: Name
}

type SingleLoadType<A, E> = { readonly result: AsyncData.AsyncData<A, E> }

/** Derives a Loader Schema from a single-slot Query. `key` names the delivery resource. */
export function defineFromQuerySingle<Name extends string, A, AI, E, EI, R>(
	query: SingleQueryForLoader<Name, A, AI, E, EI, R>,
	options: {
		readonly key: (load: SingleLoadType<A, E>) => string
	}
) {
	const resultSchema = query.Model.fields.data
	const Load = Schema.Struct({ result: resultSchema })
	const loader = define({
		name: query.name,
		data: Load as Schema.Codec<SingleLoadType<A, E>, typeof Load.Encoded>,
		key: options.key,
	})
	return Object.assign(loader, { Load })
}

/** Maps accepted deliveries while preserving loading, encoding, and receipt identity. */
export const mapMessages: {
	<Message, Next>(
		f: (message: Message, receipt: Receipt) => Next
	): <A, I>(self: Loader<A, I, Message>) => Loader<A, I, Next>
	<A, I, Message, Next>(
		self: Loader<A, I, Message>,
		f: (message: Message, receipt: Receipt) => Next
	): Loader<A, I, Next>
} = Function.dual(2, function <A, I, Message, Next>(
	self: Loader<A, I, Message>,
	f: (message: Message, receipt: Receipt) => Next
): Loader<A, I, Next> {
	const mapped = self as LoaderImpl<A, I, Message>
	return new LoaderImpl(
		self.name,
		self.data,
		self.key,
		function (data, receipt) {
			return f(mapped.toMessage(data, receipt), receipt)
		},
		self.load
	)
})

/** Encodes a decoded payload into a versioned envelope. Data-first or data-last. */
export const load: {
	<A, I, Message, E, R>(
		effect: Effect.Effect<A, E, R>
	): (self: Loader<A, I, Message>) => Effect.Effect<Envelope<I>, E | Schema.SchemaError, R>
	<A, I, Message, E, R>(
		self: Loader<A, I, Message>,
		effect: Effect.Effect<A, E, R>
	): Effect.Effect<Envelope<I>, E | Schema.SchemaError, R>
} = Function.dual(2, function <A, I, Message, E, R>(
	self: Loader<A, I, Message>,
	effect: Effect.Effect<A, E, R>
): Effect.Effect<Envelope<I>, E | Schema.SchemaError, R> {
	return self.load(effect)
})

/** Runs a keyed Query and encodes the `{ ...args, result }` payload. */
export const loadQuery: {
	<Name extends string, A, AI, E, EI, Fields extends SyncFields, R, Message>(
		query: KeyedQueryForLoader<Name, A, AI, E, EI, Fields, R>,
		args: KeyedArgs<Fields>
	): (
		self: Loader<KeyedLoadType<Fields, A, E>, unknown, Message>
	) => Effect.Effect<Envelope<unknown>, Schema.SchemaError, R>
	<Name extends string, A, AI, E, EI, Fields extends SyncFields, R, I, Message>(
		self: Loader<KeyedLoadType<Fields, A, E>, I, Message>,
		query: KeyedQueryForLoader<Name, A, AI, E, EI, Fields, R>,
		args: KeyedArgs<Fields>
	): Effect.Effect<Envelope<I>, Schema.SchemaError, R>
} = Function.dual(3, function <Name extends string, A, AI, E, EI, Fields extends SyncFields, R, I, Message>(
	self: Loader<KeyedLoadType<Fields, A, E>, I, Message>,
	query: KeyedQueryForLoader<Name, A, AI, E, EI, Fields, R>,
	args: KeyedArgs<Fields>
): Effect.Effect<Envelope<I>, Schema.SchemaError, R> {
	return query.run(args).pipe(
		Effect.map(function (result) {
			return { ...args, result }
		}),
		self.load
	)
})
