import { Effect, Function, Pipeable, Predicate, Schema } from "effect"
import type * as AsyncData from "./asyncData"
import { Envelope, EnvelopeHeader, Receipt } from "./internal/loader-envelope"
import type { KeyedArgs, KeyedSettleIf, SettleIfOptions } from "./query/internal"
import type { KeyedQuery, SyncFields } from "./query/keyedQuery"
import type { Query } from "./query/query"
import type * as Update from "./update"

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

type QueryForLoader<Name extends string, A, AI, E, EI, R> = Query<Name, A, AI, E, EI, R, boolean> & {
	readonly name: Name
}

/** Loader-shaped payload: query args (empty for unkeyed) plus an AsyncData outcome. */
export type LoadPayload<Args, A, E> = Args & {
	readonly result: AsyncData.AsyncData<A, E>
}

type KeyedLoadType<Fields extends SyncFields, A, E> = LoadPayload<KeyedArgs<Fields>, A, E>

type LoadType<A, E> = LoadPayload<{}, A, E>

/** Settles a Loader payload through a Query or lifted child's `settleIf`. */
export interface SettleIfLoad<Model, Message, Args, A, E> {
	(
		model: Model,
		load: LoadPayload<Args, A, E>,
		options: SettleIfOptions<A, E>
	): Update.Return<Model, Message>
	(load: LoadPayload<Args, A, E>, options: SettleIfOptions<A, E>): Update.Step<Model, Message>
}

type SettleIfTarget<Model, Message, A, E> = {
	readonly settleIf: {
		(
			model: Model,
			result: AsyncData.AsyncData<A, E>,
			options: SettleIfOptions<A, E>
		): Update.Return<Model, Message>
		(
			result: AsyncData.AsyncData<A, E>,
			options: SettleIfOptions<A, E>
		): Update.Step<Model, Message>
	}
}

type KeyedSettleIfTarget<Model, Message, Args, A, E> = {
	readonly settleIf: KeyedSettleIf<Model, Message, Args, A, E>
}

type WithLoadSchema<A, I, LoadSchema extends Schema.Top> = Loader<A, I> & {
	readonly Load: LoadSchema
}

export interface KeyedQueryLoader<
	Name extends string,
	A,
	AI,
	E,
	EI,
	Fields extends SyncFields,
	R,
	LoadSchema extends Schema.Top,
> extends WithLoadSchema<KeyedLoadType<Fields, A, E>, Schema.Codec.Encoded<LoadSchema>, LoadSchema> {
	readonly query: KeyedQueryForLoader<Name, A, AI, E, EI, Fields, R>
	readonly loadQuery: (
		args: KeyedArgs<Fields>
	) => Effect.Effect<Envelope<Schema.Codec.Encoded<LoadSchema>>, Schema.SchemaError, R>
}

/** Loader derived from a Query (no args). */
export interface QueryLoader<
	Name extends string,
	A,
	AI,
	E,
	EI,
	R,
	LoadSchema extends Schema.Top,
> extends WithLoadSchema<LoadType<A, E>, Schema.Codec.Encoded<LoadSchema>, LoadSchema> {
	readonly query: QueryForLoader<Name, A, AI, E, EI, R>
	readonly loadQuery: Effect.Effect<Envelope<Schema.Codec.Encoded<LoadSchema>>, Schema.SchemaError, R>
}

function isKeyedQueryForLoader(
	query: KeyedQueryForLoader<string, any, any, any, any, SyncFields, any> | QueryForLoader<string, any, any, any, any, any>
): query is KeyedQueryForLoader<string, any, any, any, any, SyncFields, any> {
	return Predicate.hasProperty(query, "Args")
}

type KeyedQueryLoaderLike = {
	readonly query: { run: (args: any) => Effect.Effect<AsyncData.AsyncData<unknown, unknown>, never, unknown> }
	readonly load: Loader<any, unknown>["load"]
}

type QueryRunRequirements<Q> = Q extends {
	run: (...args: Array<any>) => Effect.Effect<AsyncData.AsyncData<unknown, unknown>, never, infer R>
}
	? R
	: never

function runKeyedLoadQuery(self: KeyedQueryLoaderLike, args: any) {
	return self.query.run(args).pipe(
		Effect.map(function (result) {
			return { ...args, result }
		}),
		self.load as Loader<any, unknown>["load"]
	)
}

/** Runs the Query bound to a keyed QueryLoader. Data-first or data-last. */
export const loadQuery: {
	<Args>(
		args: Args
	): <Self extends KeyedQueryLoaderLike & { readonly query: { run: (args: Args) => Effect.Effect<AsyncData.AsyncData<unknown, unknown>, never, unknown> } }>(
		self: Self
	) => Effect.Effect<Envelope<unknown>, Schema.SchemaError, QueryRunRequirements<Self["query"]>>
	<Self extends KeyedQueryLoaderLike, Args extends Parameters<Self["query"]["run"]>[0]>(
		self: Self,
		args: Args
	): Effect.Effect<Envelope<unknown>, Schema.SchemaError, QueryRunRequirements<Self["query"]>>
} = Function.dual(2, runKeyedLoadQuery)

function attachKeyedQueryLoader<
	Name extends string,
	A,
	AI,
	E,
	EI,
	Fields extends SyncFields,
	R,
	LoadSchema extends Schema.Struct<
		Fields & {
			readonly result: Schema.Codec<AsyncData.AsyncData<A, E>, AsyncData.AsyncData<AI, EI>, never, never>
		}
	>,
>(
	loader: Loader<KeyedLoadType<Fields, A, E>, any>,
	Load: LoadSchema,
	query: KeyedQueryForLoader<Name, A, AI, E, EI, Fields, R>
): KeyedQueryLoader<Name, A, AI, E, EI, Fields, R, LoadSchema> {
	const bound = Object.assign(loader, {
		Load,
		query,
		loadQuery(args: KeyedArgs<Fields>) {
			return runKeyedLoadQuery(bound, args)
		},
	}) as KeyedQueryLoader<Name, A, AI, E, EI, Fields, R, LoadSchema>
	return bound
}

function attachQueryLoader<
	Name extends string,
	A,
	AI,
	E,
	EI,
	R,
	LoadSchema extends Schema.Struct<{
		readonly result: Schema.Codec<AsyncData.AsyncData<A, E>, AsyncData.AsyncData<AI, EI>, never, never>
	}>,
>(
	loader: Loader<LoadType<A, E>, any>,
	Load: LoadSchema,
	query: QueryForLoader<Name, A, AI, E, EI, R>
): QueryLoader<Name, A, AI, E, EI, R, LoadSchema> {
	const loadQuery = query.run.pipe(
		Effect.map(function (result) {
			return { result } as LoadType<A, E>
		}),
		loader.load
	)
	return Object.assign(loader, { Load, query, loadQuery }) as QueryLoader<
		Name,
		A,
		AI,
		E,
		EI,
		R,
		LoadSchema
	>
}

type LoadResultCodec = Schema.Codec<
	AsyncData.AsyncData<unknown, unknown>,
	AsyncData.AsyncData<unknown, unknown>,
	never,
	never
>

/** Derives a Loader Schema and resource key from a Query. */
export function fromQuery<Name extends string, A, AI, E, EI, Fields extends SyncFields, R>(
	query: KeyedQueryForLoader<Name, A, AI, E, EI, Fields, R>,
	options?: {
		readonly key?: (load: KeyedLoadType<Fields, A, E>) => string
	}
): KeyedQueryLoader<
	Name,
	A,
	AI,
	E,
	EI,
	Fields,
	R,
	Schema.Struct<
		Fields & {
			readonly result: Schema.Codec<AsyncData.AsyncData<A, E>, AsyncData.AsyncData<AI, EI>, never, never>
		}
	>
>
export function fromQuery<Name extends string, A, AI, E, EI, R>(
	query: QueryForLoader<Name, A, AI, E, EI, R>,
	options: {
		readonly key: (load: LoadType<A, E>) => string
	}
): QueryLoader<
	Name,
	A,
	AI,
	E,
	EI,
	R,
	Schema.Struct<{
		readonly result: Schema.Codec<AsyncData.AsyncData<A, E>, AsyncData.AsyncData<AI, EI>, never, never>
	}>
>
export function fromQuery(query: any, options?: { readonly key?: (load: any) => string }): any {
	const result = query.AsyncData.schema as LoadResultCodec
	if (isKeyedQueryForLoader(query)) {
		const Load = Schema.Struct({
			...query.Args.fields,
			result,
		})
		const key =
			options?.key ??
			function (load: KeyedLoadType<SyncFields, any, any>) {
				const args = { ...load } as Record<string, unknown>
				delete args.result
				return query.toKey(args as KeyedArgs<SyncFields>)
			}
		return attachKeyedQueryLoader(
			define({
				name: query.name,
				data: Load,
				key,
			}) as Loader<KeyedLoadType<SyncFields, any, any>, any>,
			Load,
			query
		)
	}

	const Load = Schema.Struct({ result })
	const key = options?.key
	if (key === undefined) {
		throw new Error(`Loader.fromQuery("${query.name}"): Queries require options.key`)
	}
	return attachQueryLoader(
		define({
			name: query.name,
			data: Load,
			key,
		}) as Loader<LoadType<any, any>, any>,
		Load,
		query
	)
}

function settleIfLoadInto(
	target: KeyedSettleIfTarget<any, any, any, any, any> | SettleIfTarget<any, any, any, any>,
	model: any,
	load: LoadPayload<Record<string, unknown>, any, any>,
	options: SettleIfOptions<any, any>
): Update.Return<any, any> {
	const { result, ...args } = load
	if (Object.keys(args).length > 0) {
		return (target as KeyedSettleIfTarget<any, any, any, any, any>).settleIf(model, args, result, options)
	}
	return (target as SettleIfTarget<any, any, any, any>).settleIf(model, result, options)
}

/**
 * Settles a Loader-shaped payload through a Query or lifted `settleIf`.
 * Lives on Loader (react-foldkit), not on Foldkit Query.
 */
export function settleIfLoad<Model, Message, Args extends Record<string, unknown>, A, E>(
	target: KeyedSettleIfTarget<Model, Message, Args, A, E>,
	model: Model,
	load: LoadPayload<Args, A, E>,
	options: SettleIfOptions<A, E>
): Update.Return<Model, Message>
export function settleIfLoad<Model, Message, Args extends Record<string, unknown>, A, E>(
	target: KeyedSettleIfTarget<Model, Message, Args, A, E>,
	load: LoadPayload<Args, A, E>,
	options: SettleIfOptions<A, E>
): Update.Step<Model, Message>
export function settleIfLoad<Model, Message, A, E>(
	target: SettleIfTarget<Model, Message, A, E>,
	model: Model,
	load: LoadPayload<{}, A, E>,
	options: SettleIfOptions<A, E>
): Update.Return<Model, Message>
export function settleIfLoad<Model, Message, A, E>(
	target: SettleIfTarget<Model, Message, A, E>,
	load: LoadPayload<{}, A, E>,
	options: SettleIfOptions<A, E>
): Update.Step<Model, Message>
export function settleIfLoad(
	target: KeyedSettleIfTarget<any, any, any, any, any> | SettleIfTarget<any, any, any, any>,
	modelOrLoad: any,
	loadOrOptions: any,
	maybeOptions?: SettleIfOptions<any, any>
): Update.Return<any, any> | Update.Step<any, any> {
	if (maybeOptions !== undefined) {
		return settleIfLoadInto(target, modelOrLoad, loadOrOptions, maybeOptions)
	}
	return function (model: any) {
		return settleIfLoadInto(target, model, modelOrLoad, loadOrOptions)
	}
}

/**
 * Maps accepted deliveries while preserving loading, encoding, and receipt identity.
 * Returns a plain Loader/Declaration: QueryLoader attachments (`Load`, `query`, `loadQuery`)
 * are stripped. Keep the `fromQuery` value for `loadQuery` / `Load`; pipe a mapped copy into the registry.
 */
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
