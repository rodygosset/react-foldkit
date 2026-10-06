import { Effect, Function, Option, Pipeable, Predicate, Result, Schema } from "effect"
import * as AsyncData from "foldkit/asyncData"
import type * as Update from "./update"
import { Envelope, EnvelopeHeader, Receipt } from "./internal/loader-envelope"
import type { KeyedQuery, Query } from "foldkit/experimental/query"

type SyncFields = { readonly [x: PropertyKey]: Schema.Codec<unknown, unknown, never, never> }
type KeyedArgs<Fields extends SyncFields> = Schema.Schema.Type<Schema.Struct<Fields>>

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
					Schema.makeFilter((envelope) => key(envelope.payload) === envelope.key, {
						message: "Loader resource key does not match its payload",
					})
				)
		)
		this.decode = function (input) {
			const { name, key, version, payload } = decode(input)
			return toMessage(payload, { name, key, version })
		}
	}
}

const encodeLoad =
	<A, I>(config: Config<A, I>, encode: (data: A) => Effect.Effect<I, Schema.SchemaError>): Loader<A, I>["load"] =>
	(effect) =>
		Effect.flatMap(effect, (data) =>
			Effect.map(encode(data), (payload) => ({
				_tag: EnvelopeHeader.fields._tag.literal,
				format: EnvelopeHeader.fields.format.literal,
				name: config.name,
				key: config.key(data),
				version: crypto.randomUUID(),
				payload,
			}))
		)

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
>

type QueryForLoader<Name extends string, A, AI, E, EI, R> = Query<Name, A, AI, E, EI, R, boolean>

/** Loader-shaped payload: query args (empty for unkeyed) plus an AsyncData outcome. */
export type LoadPayload<Args, A, E> = Args & {
	readonly result: AsyncData.AsyncData<A, E>
}

type KeyedLoadType<Fields extends SyncFields, A, E> = LoadPayload<KeyedArgs<Fields>, A, E>

type LoadType<A, E> = LoadPayload<{}, A, E>

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

const isKeyedQueryForLoader = (
	query:
		| KeyedQueryForLoader<string, any, any, any, any, SyncFields, any>
		| QueryForLoader<string, any, any, any, any, any>
): query is KeyedQueryForLoader<string, any, any, any, any, SyncFields, any> => typeof query.run === "function"

type KeyedQueryLoaderLike = {
	readonly query: { run: (args: any) => Effect.Effect<AsyncData.AsyncData<unknown, unknown>, never, unknown> }
	readonly load: Loader<any, unknown>["load"]
}

type QueryRunRequirements<Q> = Q extends {
	run: (...args: Array<any>) => Effect.Effect<AsyncData.AsyncData<unknown, unknown>, never, infer R>
}
	? R
	: never

const runKeyedLoadQuery = (self: KeyedQueryLoaderLike, args: any) =>
	self.query.run(args).pipe(
		Effect.map((result) => ({ ...args, result })),
		self.load as Loader<any, unknown>["load"]
	)

/** Runs the Query bound to a keyed QueryLoader. Data-first or data-last. */
export const loadQuery: {
	<Args>(args: Args): <
		Self extends KeyedQueryLoaderLike & {
			readonly query: {
				run: (args: Args) => Effect.Effect<AsyncData.AsyncData<unknown, unknown>, never, unknown>
			}
		},
	>(
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
		loadQuery: (args: KeyedArgs<Fields>) => runKeyedLoadQuery(bound, args),
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
		Effect.map((result) => ({ result }) as LoadType<A, E>),
		loader.load
	)
	return Object.assign(loader, { Load, query, loadQuery }) as QueryLoader<Name, A, AI, E, EI, R, LoadSchema>
}

type LoadResultCodec = Schema.Codec<
	AsyncData.AsyncData<unknown, unknown>,
	AsyncData.AsyncData<unknown, unknown>,
	never,
	never
>

/** Binds a Foldkit Query to explicit Loader serialization Schemas and resource identity. */
export function fromQuery<Name extends string, A, AI, E, EI, Fields extends SyncFields, R>(
	query: KeyedQueryForLoader<Name, A, AI, E, EI, Fields, R>,
	options: {
		readonly name: string
		readonly args: NoInfer<Fields>
		readonly data: Schema.Codec<NoInfer<A>, NoInfer<AI>>
		readonly error: Schema.Codec<NoInfer<E>, NoInfer<EI>>
		readonly key: (load: KeyedLoadType<Fields, A, E>) => string
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
		readonly name: string
		readonly data: Schema.Codec<NoInfer<A>, NoInfer<AI>>
		readonly error: Schema.Codec<NoInfer<E>, NoInfer<EI>>
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
export function fromQuery(
	query: any,
	options: {
		readonly name: string
		readonly args?: SyncFields
		readonly data: Schema.Codec<any, any>
		readonly error: Schema.Codec<any, any>
		readonly key: (load: any) => string
	}
): any {
	if (options === undefined) throw new Error("Loader.fromQuery requires serialization options and a resource key")
	const result = AsyncData.Schema(options.data, options.error).schema as LoadResultCodec
	if (isKeyedQueryForLoader(query)) {
		if (options.args === undefined) throw new Error("Keyed Loader.fromQuery requires options.args")
		const Load = Schema.Struct({ ...options.args, result })
		return attachKeyedQueryLoader(define({ name: options.name, data: Load, key: options.key }), Load, query)
	}
	const Load = Schema.Struct({ result })
	return attachQueryLoader(define({ name: options.name, data: Load, key: options.key }), Load, query)
}

/** Freshness policy for applying a Loader outcome to a Foldkit Query. */
export interface SettleQueryIfOptions<A, E> {
	readonly fresher: (incoming: A, current: A) => boolean
	readonly acceptFailure?: (current: AsyncData.AsyncData<A, E>) => boolean
}

/** Applies an accepted Loader outcome through Foldkit lifecycle operations, returning only cancellation Commands. */
export function settleQueryIf<
	Name extends string,
	A,
	AI,
	E,
	EI,
	Fields extends SyncFields,
	R,
	Interrupt extends boolean,
>(
	query: KeyedQuery<Name, A, AI, E, EI, Fields, R, Interrupt>,
	model: KeyedQuery<Name, A, AI, E, EI, Fields, R, Interrupt>["Model"]["Type"],
	args: KeyedArgs<Fields>,
	result: AsyncData.AsyncData<A, E>,
	options: SettleQueryIfOptions<A, E>
): Update.Return<
	KeyedQuery<Name, A, AI, E, EI, Fields, R, Interrupt>["Model"]["Type"],
	KeyedQuery<Name, A, AI, E, EI, Fields, R, Interrupt>["Message"]["Type"]
>
export function settleQueryIf<Name extends string, A, AI, E, EI, R, Interrupt extends boolean>(
	query: Query<Name, A, AI, E, EI, R, Interrupt>,
	model: Query<Name, A, AI, E, EI, R, Interrupt>["Model"]["Type"],
	result: AsyncData.AsyncData<A, E>,
	options: SettleQueryIfOptions<A, E>
): Update.Return<
	Query<Name, A, AI, E, EI, R, Interrupt>["Model"]["Type"],
	Query<Name, A, AI, E, EI, R, Interrupt>["Message"]["Type"]
>
export function settleQueryIf(query: any, model: any, ...input: any[]): Update.Return<any, any> {
	const isKeyed = typeof query.run === "function"
	const [args, result, options] = isKeyed ? input : [undefined, ...input]
	const current = isKeyed ? query.read(model, args) : query.read(model)
	const maybeData = AsyncData.getData(current)
	const isAccepted = AsyncData.isSuccess(result)
		? Option.isNone(maybeData) || options.fresher(result.data, maybeData.value)
		: AsyncData.isFailure(result) &&
			(options.acceptFailure?.(current) ?? (!AsyncData.hasData(current) && !AsyncData.isPending(current)))
	if (!isAccepted) return { model }

	const cleared = isKeyed ? query.forget(model, args) : query.reset(model)
	let started = isKeyed ? query.loadIfMissing(cleared.model, args) : query.loadIfMissing(cleared.model)
	const complete = (nextModel: any, outcome: Result.Result<unknown, unknown>) =>
		query.update(
			nextModel,
			query.Message.CompletedFetch({
				...(isKeyed ? { args } : {}),
				...(Predicate.hasProperty(nextModel, "instanceId") ? { instanceId: nextModel.instanceId } : {}),
				generation: nextModel.generation,
				result: outcome,
			})
		)
	// A permitted failure retains cached data using Foldkit's refresh transition.
	if (AsyncData.isFailure(result) && Option.isSome(maybeData)) {
		const retained = complete(started.model, Result.succeed(maybeData.value))
		started = isKeyed ? query.revalidate(retained.model, args) : query.revalidate(retained.model)
	}
	const settled = complete(
		started.model,
		AsyncData.isSuccess(result) ? Result.succeed(result.data) : Result.fail(result.error)
	)
	// Fetch Commands constructed to reserve a generation are never executed.
	return { model: settled.model, ...(cleared.commands === undefined ? {} : { commands: cleared.commands }) }
}

/**
 * Maps accepted deliveries while preserving loading, encoding, and receipt identity.
 * Returns a plain Loader. QueryLoader attachments (`Load`, `query`, `loadQuery`)
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
} = Function.dual(2, function <
	A,
	I,
	Message,
	Next,
>(self: Loader<A, I, Message>, f: (message: Message, receipt: Receipt) => Next): Loader<A, I, Next> {
	const mapped = self as LoaderImpl<A, I, Message>
	return new LoaderImpl(
		self.name,
		self.data,
		self.key,
		(data, receipt) => f(mapped.toMessage(data, receipt), receipt),
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
} = Function.dual(
	2,
	<A, I, Message, E, R>(
		self: Loader<A, I, Message>,
		effect: Effect.Effect<A, E, R>
	): Effect.Effect<Envelope<I>, E | Schema.SchemaError, R> => self.load(effect)
)
