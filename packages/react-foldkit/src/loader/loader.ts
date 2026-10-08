import { Crypto, Effect, Function, Option, Pipeable, Predicate, Result, Schema, SchemaIssue } from "effect"
import * as AsyncData from "foldkit/asyncData"
import type { KeyedQuery, Query } from "foldkit/experimental/query"
import type * as Update from "../update"
import { layerWebCrypto } from "./crypto"
import { Envelope, EnvelopeHeader, Receipt } from "./envelope"
import { makeResourceKey, type ReadKey } from "./key"

type SyncFields = { readonly [x: PropertyKey]: Schema.Codec<unknown, unknown, never, never> }
type KeyedArgs<Fields extends SyncFields> = Schema.Schema.Type<Schema.Struct<Fields>>

export { Receipt } from "./envelope"
export type { Envelope } from "./envelope"

/**
 * A Message decoded from loader data, together with the receipt used to track its delivery.
 * Router adapters use the receipt to avoid sending the same loaded result more than once.
 *
 * @category models
 * @since 0.1.0
 */
export interface Delivery<out Message> {
	/**
	 * Identifies which loaded result produced this Message.
	 */
	readonly receipt: Receipt
	readonly message: Message
}

/**
 * A named decoder that turns loader data into application Messages.
 * Pass declarations to a router adapter such as `TanStack.make` so it can recognize and decode
 * results returned by your route loaders.
 *
 * Decoding checks the envelope and payload before creating a Message. It does not load data.
 *
 * @category models
 * @since 0.1.0
 */
export interface Declaration<out Message> extends Pipeable.Pipeable {
	/**
	 * Identifies which loader data this declaration decodes. A registry rejects repeated names.
	 */
	readonly name: string
	/**
	 * Returns the decoded Message and receipt, or a `SchemaError`. Exceptions from key or Message
	 * callbacks remain thrown exceptions.
	 */
	readonly decodeDelivery: (envelope: unknown) => Result.Result<Delivery<Message>, Schema.SchemaError>
	/**
	 * Returns the decoded Message without its receipt. Validation failures are `SchemaError`
	 * values.
	 */
	readonly decode: (envelope: unknown) => Result.Result<Message, Schema.SchemaError>
}

/**
 * A declaration that can also load data and encode it for delivery to the application.
 * Use `load` in a route loader, then let the router adapter decode its result into a Message.
 *
 * By default, the decoded Message is the loaded data itself. Use `mapMessages` to wrap that data
 * in one of your application's Messages.
 *
 * @category models
 * @since 0.1.0
 */
export interface Loader<A, I, out Message = A> extends Declaration<Message> {
	/**
	 * Schema used to encode loaded data and decode it when delivered.
	 */
	readonly data: Schema.Codec<A, I>
	/**
	 * Derives a resource key from decoded data. Exceptions from this callback remain defects
	 * during loading or throws during decoding.
	 */
	readonly key: (data: A) => string
	/**
	 * Creates the Effect that loads and encodes data. Each execution gets a new delivery version
	 * from an available Crypto service or Web Crypto. Crypto failures become defects.
	 */
	readonly load: <E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<Envelope<I>, E | Schema.SchemaError, R>
}

/**
 * The name, payload Schema, and resource key used to create a Loader with `define`.
 * The name identifies which declaration decodes the data. The key identifies which resource
 * was loaded, such as a project ID.
 *
 * `define` converts the Schema to a JSON codec with `Schema.toCodecJson`. The key is calculated
 * from decoded data and checked again when the result is decoded.
 *
 * @category configuration
 * @since 0.1.0
 */
export interface Config<A, I> {
	/**
	 * Identifies the declaration in envelopes. Use a distinct name for each registry entry.
	 */
	readonly name: string
	/**
	 * Schema for the data returned by the loading Effect. It must support `Schema.toCodecJson`.
	 */
	readonly data: Schema.Codec<A, I>
	/**
	 * Identifies the loaded resource, such as a project ID. The same resource must have the same key.
	 */
	readonly key: (data: NoInfer<A>) => string
}

class LoaderImpl<A, I, Message> extends Pipeable.Class implements Loader<A, I, Message> {
	readonly decode: Loader<A, I, Message>["decode"]

	constructor(
		readonly name: string,
		readonly data: Schema.Codec<A, I>,
		readonly key: (data: A) => string,
		readonly load: Loader<A, I, Message>["load"],
		readonly decodeDelivery: Loader<A, I, Message>["decodeDelivery"]
	) {
		super()
		this.decode = (input) => Result.map(decodeDelivery(input), (delivery) => delivery.message)
	}
}

function encodeLoad<A, I>(config: Config<A, I>, readKey: ReadKey<A>): Loader<A, I>["load"] {
	const encode = Schema.encodeEffect(config.data)
	return (effect) =>
		Effect.gen(function* () {
			const data = yield* effect
			const payload = yield* encode(data)
			const key = yield* Effect.suspend(() => Effect.fromResult(readKey(data)))
			const crypto = yield* Effect.serviceOption(Crypto.Crypto)
			const version = yield* Option.match(crypto, {
				onSome: (service) => Effect.orDie(service.randomUUIDv4),
				onNone: () =>
					Effect.flatMap(Crypto.Crypto, (service) => service.randomUUIDv4).pipe(
						Effect.provide(layerWebCrypto),
						Effect.orDie
					),
			})
			return {
				_tag: EnvelopeHeader.fields._tag.schema.literal,
				format: EnvelopeHeader.fields.format.literal,
				name: config.name,
				key,
				version,
				payload,
			}
		})
}

function make<A, I>(input: Config<A, I>, readKey: ReadKey<A>): Loader<A, Schema.Json> {
	const config = { ...input, data: input.data.pipe(Schema.toCodecJson) }
	const decode = Schema.decodeUnknownResult(
		Envelope(config.data).pipe(Schema.fieldsAssign({ name: Schema.Literal(config.name) }))
	)
	const decodeDelivery: Loader<A, Schema.Json>["decodeDelivery"] = (input) =>
		Result.gen(function* () {
			const { name, key, version, payload } = yield* decode(input)
			const expected = yield* readKey(payload)
			if (expected !== key) {
				return yield* Result.fail(
					new Schema.SchemaError(
						new SchemaIssue.InvalidValue({ message: "Loader resource key does not match its payload" })
					)
				)
			}
			return { receipt: { name, key, version }, message: payload }
		})
	return new LoaderImpl(config.name, config.data, config.key, encodeLoad(config, readKey), decodeDelivery)
}

/**
 * Creates a Loader that encodes loaded data and decodes it back into the same data type.
 *
 * Give each declaration a unique name in its router registry. Choose a stable key for each
 * resource, such as a project ID. The returned Loader uses a JSON codec derived from `data`.
 * Creating the Loader does not execute any Effect.
 *
 * @see {@link load} for loading and decoding a project
 * @see {@link fromQuery} for creating a Loader from a Foldkit Query
 * @see {@link mapMessages} for wrapping decoded data in an application Message
 * @category constructors
 * @since 0.1.0
 */
export const define = <A, I>(config: Config<A, I>): Loader<A, Schema.Json> =>
	make(config, (data) => Result.succeed(config.key(data)))

/**
 * The arguments and result of a Query loaded outside the application Store.
 * Use this payload in a Message so update can apply the result to the Query entry identified
 * by `args`. A failed Query is carried in `result` as `AsyncData.Failure`.
 *
 * @category models
 * @since 0.1.0
 */
export type LoadPayload<Args, A, E> = {
	/**
	 * Decoded Query arguments that identify the resource.
	 */
	readonly args: Args
	/**
	 * Settled Query outcome. Query failures travel as AsyncData rather than as transport
	 * failures.
	 */
	readonly result: AsyncData.AsyncData<A, E>
}

type KeyedLoadType<Fields extends SyncFields, A, E> = LoadPayload<KeyedArgs<Fields>, A, E>

type LoadType<A, E> = { readonly result: AsyncData.AsyncData<A, E> }

type WithLoadSchema<A, I, LoadSchema extends Schema.Top> = Loader<A, I> & {
	/**
	 * Schema for the Query arguments and result delivered to the application. Use it as a field
	 * in the Message that receives route loader data. Queries without arguments include only `result`.
	 */
	readonly Load: LoadSchema
}

/**
 * A Loader for a Foldkit Query whose resources are identified by arguments.
 * Use it to load a resource in a route loader and deliver both its arguments and result to the
 * application. For example, a project route can load `{ projectId }` without starting a Store.
 *
 * `Load` is the payload Schema for an application Message. `loadQuery(args)` creates the Effect
 * that runs the Query and encodes `{ args, result }`.
 *
 * @category models
 * @since 0.1.0
 */
export interface KeyedQueryLoader<
	Name extends string,
	A,
	AI,
	E,
	EI,
	Fields extends SyncFields,
	R,
	LoadSchema extends Schema.Top,
	Interrupt extends boolean = boolean,
> extends WithLoadSchema<KeyedLoadType<Fields, A, E>, Schema.Json, LoadSchema> {
	/**
	 * Query used to load the data. Use it to read or update the corresponding Query Model.
	 */
	readonly query: KeyedQuery<Name, A, AI, E, EI, Fields, R, Interrupt>
	/**
	 * Executes the Query with these arguments when run and encodes its outcome. Query failures
	 * become AsyncData payloads; encoding failures use `SchemaError`.
	 */
	readonly loadQuery: (args: KeyedArgs<Fields>) => Effect.Effect<Envelope<Schema.Json>, Schema.SchemaError, R>
}

/**
 * A Loader for a Foldkit Query that takes no arguments.
 * Use it to load a single resource, such as the current user's profile, outside the Store and
 * deliver its result to the application.
 *
 * `Load` is the payload Schema for an application Message. `loadQuery` is the Effect that runs
 * the Query and encodes `{ result }`. Its resource key is `singleton`.
 *
 * @category models
 * @since 0.1.0
 */
export interface QueryLoader<
	Name extends string,
	A,
	AI,
	E,
	EI,
	R,
	LoadSchema extends Schema.Top,
	Interrupt extends boolean = boolean,
> extends WithLoadSchema<LoadType<A, E>, Schema.Json, LoadSchema> {
	/**
	 * Query used to load the data. Use it to read or update the corresponding Query Model.
	 */
	readonly query: Query<Name, A, AI, E, EI, R, Interrupt>
	/**
	 * Executes the Query when run and encodes its outcome. Query failures become AsyncData
	 * payloads; encoding failures use `SchemaError`.
	 */
	readonly loadQuery: Effect.Effect<Envelope<Schema.Json>, Schema.SchemaError, R>
}

interface KeyedLoadProgram<Args, I, R> {
	readonly loadQuery: (args: Args) => Effect.Effect<Envelope<I>, Schema.SchemaError, R>
}

/**
 * Creates the Effect that runs a Query Loader and encodes its result for delivery.
 *
 * For a Query without arguments, call `loadQuery(loader)`. For a keyed Query, call
 * `loadQuery(loader, args)` or `loader.pipe(loadQuery(args))`. The Query runs only when you
 * execute the returned Effect.
 *
 * Query failures are encoded as `AsyncData.Failure`. Encoding failures use `SchemaError`, and
 * the Effect requires the same services as the Query.
 *
 * @see {@link fromQuery} for an example with a project Query
 * @category encoding
 * @since 0.1.0
 */
export const loadQuery: {
	<I, R>(self: {
		readonly loadQuery: Effect.Effect<Envelope<I>, Schema.SchemaError, R>
	}): Effect.Effect<Envelope<I>, Schema.SchemaError, R>
	<Args>(args: Args): <I, R>(self: KeyedLoadProgram<Args, I, R>) => Effect.Effect<Envelope<I>, Schema.SchemaError, R>
	<Args, I, R>(
		self: KeyedLoadProgram<Args, I, R>,
		args: NoInfer<Args>
	): Effect.Effect<Envelope<I>, Schema.SchemaError, R>
} = Function.dual(
	(args) => args.length === 2 || (Predicate.hasProperty(args[0], "loadQuery") && Effect.isEffect(args[0].loadQuery)),
	<Args, I, R>(
		self: KeyedLoadProgram<Args, I, R> | { readonly loadQuery: Effect.Effect<Envelope<I>, Schema.SchemaError, R> },
		args: Args
	) => (typeof self.loadQuery === "function" ? self.loadQuery(args) : self.loadQuery)
)

type QueryLoadSchema<A, AI, E, EI> = Schema.Struct<{
	readonly result: Schema.Codec<AsyncData.AsyncData<A, E>, AsyncData.AsyncDataEncoded<AI, EI>>
}>

type KeyedQueryLoadSchema<Fields extends SyncFields, A, AI, E, EI> = Schema.Struct<
	{ readonly args: Schema.Struct<Fields> } & QueryLoadSchema<A, AI, E, EI>["fields"]
>

/**
 * Options for naming a Query Loader declaration.
 * Override the name when registering two Loaders whose Queries have the same Fetch Command name.
 *
 * @category configuration
 * @since 0.1.0
 */
export interface FromQueryOptions {
	/**
	 * Defaults to the Query Fetch Command name. Override it when multiple declarations would
	 * share a registry name.
	 */
	readonly name?: string
}

/**
 * Options for naming a keyed Query Loader and identifying its resources.
 * Use `key` when your application has a resource ID that should replace the default key derived
 * from the Query arguments.
 *
 * @category configuration
 * @since 0.1.0
 */
export interface FromKeyedQueryOptions<Args> extends FromQueryOptions {
	/**
	 * Receives decoded arguments. Defaults to canonical JSON of their encoded form, with object
	 * keys sorted recursively.
	 */
	readonly key?: (args: Args) => string
}

type KeyedQueryInput<
	Name extends string,
	A,
	AI,
	E,
	EI,
	Fields extends SyncFields,
	R,
	Interrupt extends boolean,
> = readonly [
	query: KeyedQuery<Name, A, AI, E, EI, Fields, R, Interrupt>,
	options?: FromKeyedQueryOptions<KeyedArgs<Fields>>,
]

type QueryInput<Name extends string, A, AI, E, EI, R, Interrupt extends boolean> = readonly [
	query: Query<Name, A, AI, E, EI, R, Interrupt>,
	options?: FromQueryOptions,
]

// Narrow the Query and its optional key callback together.
const isKeyedQueryInput = <Name extends string, A, AI, E, EI, Fields extends SyncFields, R, Interrupt extends boolean>(
	input: KeyedQueryInput<Name, A, AI, E, EI, Fields, R, Interrupt> | QueryInput<Name, A, AI, E, EI, R, Interrupt>
): input is KeyedQueryInput<Name, A, AI, E, EI, Fields, R, Interrupt> => typeof input[0].run === "function"

/**
 * Creates a Loader from a Foldkit Query for use in route loaders.
 *
 * The returned `Load` Schema describes the payload for that Message. Keyed Queries produce
 * `{ args, result }`; Queries without arguments produce `{ result }`. Query failures are
 * included as `AsyncData.Failure`, so the application can handle them in update.
 *
 * **Details**
 *
 * The declaration name defaults to `query.Fetch.name`. Queries without arguments use the key
 * `singleton`. Keyed Queries use JSON of their encoded arguments with object keys sorted,
 * unless you supply `key`. These delivery keys are separate from the Query's cache keys.
 *
 * **Example** (Creating a Query Loader and its Message)
 *
 * ```ts
 * import { Effect, Schema } from "effect"
 * import * as Query from "foldkit/experimental/query"
 * import * as Loader from "react-foldkit/loader"
 * import { defineMessageUnion } from "react-foldkit/message"
 *
 * const Project = Schema.Struct({ id: Schema.String, title: Schema.String })
 *
 * const query = Query.define({
 * 	name: "Project",
 * 	args: { projectId: Schema.String },
 * 	data: Project,
 * 	error: Schema.String,
 * 	execute: ({ projectId }) => Effect.succeed({ id: projectId, title: "Foldkit" }),
 * })
 *
 * export const loader = Loader.fromQuery(query)
 *
 * export const Message = defineMessageUnion({ CompletedLoadProject: { load: loader.Load } })
 * ```
 *
 * @see {@link settleQueryIf} for applying a delivered result to the Query Model
 * @category constructors
 * @since 0.1.0
 */
export function fromQuery<Name extends string, A, AI, E, EI, Fields extends SyncFields, R, Interrupt extends boolean>(
	query: KeyedQuery<Name, A, AI, E, EI, Fields, R, Interrupt>,
	options?: FromKeyedQueryOptions<KeyedArgs<Fields>>
): KeyedQueryLoader<Name, A, AI, E, EI, Fields, R, KeyedQueryLoadSchema<Fields, A, AI, E, EI>, Interrupt>
export function fromQuery<Name extends string, A, AI, E, EI, R, Interrupt extends boolean>(
	query: Query<Name, A, AI, E, EI, R, Interrupt>,
	options?: FromQueryOptions
): QueryLoader<Name, A, AI, E, EI, R, QueryLoadSchema<A, AI, E, EI>, Interrupt>
export function fromQuery<Name extends string, A, AI, E, EI, Fields extends SyncFields, R, Interrupt extends boolean>(
	...input: KeyedQueryInput<Name, A, AI, E, EI, Fields, R, Interrupt> | QueryInput<Name, A, AI, E, EI, R, Interrupt>
) {
	if (isKeyedQueryInput(input)) {
		const [query, options = {}] = input
		const Entry = query.Model.fields.entries.value
		const Load = Schema.Struct({ args: Entry.fields.args, result: Entry.fields.data })
		const override = options.key
		const argsKey: ReadKey<KeyedArgs<Fields>> =
			override === undefined ? makeResourceKey(Entry.fields.args) : (args) => Result.succeed(override(args))
		const readKey = ({ args }: KeyedLoadType<Fields, A, E>) => argsKey(args)
		const key = (data: KeyedLoadType<Fields, A, E>) => Result.getOrThrow(readKey(data))
		const loader = make({ name: options.name ?? query.Fetch.name, data: Load, key }, readKey)
		return Object.assign(loader, {
			Load,
			query,
			loadQuery: (args: KeyedArgs<Fields>) =>
				Effect.suspend(() => query.run(args)).pipe(
					Effect.map((result) => ({ args, result })),
					loader.load
				),
		})
	}
	const [query, options = {}] = input
	const Load = Schema.Struct({ result: query.Model.fields.data })
	const loader = define({
		name: options.name ?? query.Fetch.name,
		data: Load,
		key: () => "singleton",
	})
	return Object.assign(loader, {
		Load,
		query,
		loadQuery: query.run.pipe(
			Effect.map((result) => ({ result })),
			loader.load
		),
	})
}

/**
 * The policy for accepting a result loaded outside the Store into a Query Model.
 * Use a data revision or timestamp to reject older results. Choose whether an incoming failure
 * should replace the current Query state.
 *
 * @category configuration
 * @since 0.1.0
 */
export interface SettleQueryIfOptions<A, E> {
	/**
	 * Compares an incoming success with existing data. Return `false` to keep the Model. A
	 * success without existing data is accepted without calling this function.
	 */
	readonly fresher: (incoming: A, current: A) => boolean
	/**
	 * Decides whether to accept a failure. Defaults to accepting only when the current state has
	 * neither data nor a pending request.
	 */
	readonly acceptFailure?: (current: AsyncData.AsyncData<A, E>) => boolean
}

type QuerySettlementInput<Name extends string, A, AI, E, EI, R, Interrupt extends boolean> = readonly [
	query: Query<Name, A, AI, E, EI, R, Interrupt>,
	model: Query<Name, A, AI, E, EI, R, Interrupt>["Model"]["Type"],
	result: AsyncData.AsyncData<A, E>,
	options: SettleQueryIfOptions<A, E>,
]

type KeyedQuerySettlementInput<
	Name extends string,
	A,
	AI,
	E,
	EI,
	Fields extends SyncFields,
	R,
	Interrupt extends boolean,
> = readonly [
	query: KeyedQuery<Name, A, AI, E, EI, Fields, R, Interrupt>,
	model: KeyedQuery<Name, A, AI, E, EI, Fields, R, Interrupt>["Model"]["Type"],
	args: KeyedArgs<Fields>,
	result: AsyncData.AsyncData<A, E>,
	options: SettleQueryIfOptions<A, E>,
]

interface Settlement<Model, Message, A, E> {
	readonly clear: (model: Model) => Update.Return<Model, Message>
	readonly loadIfMissing: (model: Model) => Model
	readonly revalidate: (model: Model) => Model
	readonly complete: (model: Model, result: Result.Result<A, E>) => Model
}

function settle<Model, Message, A, E>(
	model: Model,
	current: AsyncData.AsyncData<A, E>,
	result: AsyncData.AsyncData<A, E>,
	options: SettleQueryIfOptions<A, E>,
	query: Settlement<Model, Message, A, E>
): Update.Return<Model, Message> {
	const maybeData = AsyncData.getData(current)
	if (AsyncData.isSuccess(result)) {
		if (Option.isSome(maybeData) && !options.fresher(result.data, maybeData.value)) return { model }
	} else if (AsyncData.isFailure(result)) {
		if (!(options.acceptFailure?.(current) ?? (!AsyncData.hasData(current) && !AsyncData.isPending(current))))
			return { model }
	} else return { model }

	const cleared = query.clear(model)
	let next = query.loadIfMissing(cleared.model)
	// Refreshing retained data preserves Foldkit's failure-with-cached-data transition.
	if (AsyncData.isFailure(result) && Option.isSome(maybeData)) {
		next = query.revalidate(query.complete(next, Result.succeed(maybeData.value)))
	}
	const settled = query.complete(
		next,
		AsyncData.isSuccess(result) ? Result.succeed(result.data) : Result.fail(result.error)
	)
	// Loading operations reserve a generation; their fetch Commands are not executed.
	return { model: settled, ...(cleared.commands === undefined ? {} : { commands: cleared.commands }) }
}

/**
 * Applies a result loaded outside the Store to a Query Model when your acceptance policy allows it.
 * Use it in update to reconcile route loader data with data already held by the Query.
 *
 * **Details**
 *
 * A success is accepted when there is no current data or `fresher` returns true. Failures follow
 * `acceptFailure`. By default, a failure is accepted only when the Query has no data and no
 * pending request. Initial and pending results are ignored. Rejected results leave the Model unchanged.
 *
 * An accepted result replaces the Query state and prevents older in-flight fetches from
 * replacing it later. The helper returns cancellation Commands for interruptible Queries.
 * Return those Commands from update so the Store can stop the obsolete work. This helper does
 * not start a fetch.
 *
 * **Example** (Keeping the newest project revision)
 *
 * ```ts
 * import { Effect, Schema } from "effect"
 * import * as Query from "foldkit/experimental/query"
 * import * as AsyncData from "react-foldkit/asyncData"
 * import * as Loader from "react-foldkit/loader"
 *
 * const Project = Schema.Struct({ title: Schema.String, revision: Schema.Finite })
 *
 * const query = Query.define({
 * 	name: "Project",
 * 	data: Project,
 * 	error: Schema.String,
 * 	execute: Effect.succeed({ title: "Draft", revision: 1 }),
 * })
 *
 * export const settled = Loader.settleQueryIf(
 * 	query,
 * 	query.init(),
 * 	AsyncData.Success({ data: { title: "Published", revision: 2 } }),
 * 	{ fresher: (incoming, current) => incoming.revision > current.revision }
 * )
 * ```
 *
 * @see {@link SettleQueryIfOptions} for the acceptance callbacks
 * @category combinators
 * @since 0.1.0
 */
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
	...input:
		| KeyedQuerySettlementInput<Name, A, AI, E, EI, Fields, R, Interrupt>
		| QuerySettlementInput<Name, A, AI, E, EI, R, Interrupt>
) {
	if (input.length === 5) {
		const [query, model, args, result, options] = input
		type Model = typeof query.Model.Type
		type Completed = Extract<typeof query.Message.Type, { readonly _tag: "CompletedFetch" }>
		return settle(model, query.read(model, args), result, options, {
			clear: (model) => query.forget(model, args),
			loadIfMissing: (model) => query.loadIfMissing(model, args).model,
			revalidate: (model) => query.revalidate(model, args).model,
			complete: (model: Model, result: Result.Result<A, E>) =>
				// Model and Message share the conditional instanceId field; TS cannot correlate Interrupt.
				query.update(model, {
					_tag: "CompletedFetch",
					args,
					generation: model.generation,
					result,
					...(Predicate.hasProperty(model, "instanceId") ? { instanceId: model.instanceId } : {}),
				} satisfies Completed).model,
		})
	}
	const [query, model, result, options] = input
	type Model = typeof query.Model.Type
	type Completed = Extract<typeof query.Message.Type, { readonly _tag: "CompletedFetch" }>
	return settle(model, query.read(model), result, options, {
		clear: query.reset,
		loadIfMissing: (model) => query.loadIfMissing(model).model,
		revalidate: (model) => query.revalidate(model).model,
		complete: (model: Model, result: Result.Result<A, E>) =>
			// Model and Message share the conditional instanceId field; TS cannot correlate Interrupt.
			query.update(model, {
				_tag: "CompletedFetch",
				generation: model.generation,
				result,
				...(Predicate.hasProperty(model, "instanceId") ? { instanceId: model.instanceId } : {}),
			} satisfies Completed).model,
	})
}

/**
 * Maps a Loader's decoded result to an application Message.
 * Use the returned declaration in your router registry. Loading still uses the same payload
 * Schema, resource key, and delivery version.
 *
 * **Gotchas**
 *
 * The returned value is a plain Loader. If you started with a Query Loader, keep the original
 * value to call `loadQuery` or use its `Load` Schema.
 *
 * **Example** (Turning a loaded project into a Message)
 *
 * ```ts
 * import { Schema } from "effect"
 * import * as Loader from "react-foldkit/loader"
 * import { defineMessageUnion } from "react-foldkit/message"
 *
 * const Project = Schema.Struct({ id: Schema.String, title: Schema.String })
 *
 * const Message = defineMessageUnion({ LoadedProject: { project: Project } })
 *
 * const loader = Loader.define({ name: "Project", data: Project, key: (project) => project.id })
 *
 * export const declaration = loader.pipe(Loader.mapMessages((project) => Message.LoadedProject({ project })))
 * ```
 *
 * @see {@link fromQuery} for mapping a Query Loader's result
 * @category mapping
 * @since 0.1.0
 */
export const mapMessages: {
	<Message, Next>(
		f: (message: Message, receipt: Receipt) => Next
	): <A, I>(self: Loader<A, I, Message>) => Loader<A, I, Next>
	<A, I, Message, Next>(
		self: Loader<A, I, Message>,
		f: (message: Message, receipt: Receipt) => Next
	): Loader<A, I, Next>
} = Function.dual(
	2,
	<A, I, Message, Next>(
		self: Loader<A, I, Message>,
		f: (message: Message, receipt: Receipt) => Next
	): Loader<A, I, Next> =>
		new LoaderImpl(self.name, self.data, self.key, self.load, (input) =>
			Result.map(self.decodeDelivery(input), ({ receipt, message }) => ({
				receipt,
				message: f(message, receipt),
			}))
		)
)

/**
 * Creates an Effect that loads data and encodes it for delivery through a router adapter.
 * Run this Effect in a route loader and return its envelope as the route's loader data.
 *
 * **Details**
 *
 * The Effect keeps the supplied Effect's failures and required services. Encoding can fail
 * with `SchemaError`. Each execution creates a new delivery version using an available
 * `Crypto` service or Web Crypto. Crypto failures and exceptions from `key` become defects.
 *
 * **Example** (Creating a project loading Effect)
 *
 * ```ts
 * import { Effect, Schema } from "effect"
 * import * as Loader from "react-foldkit/loader"
 *
 * const Project = Schema.Struct({ id: Schema.String, title: Schema.String })
 *
 * const loader = Loader.define({ name: "Project", data: Project, key: (project) => project.id })
 *
 * export const load = () => Loader.load(loader, Effect.succeed({ id: "p1", title: "Foldkit" }))
 * ```
 *
 * @see {@link mapMessages} for decoding a result into an application Message
 * @see {@link loadQuery} for running a Query Loader
 * @category encoding
 * @since 0.1.0
 */
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
