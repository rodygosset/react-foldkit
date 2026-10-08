import { Effect, Function, Option, Pipeable, Predicate, Result, Schema, SchemaIssue } from "effect"
import * as AsyncData from "foldkit/asyncData"
import type { KeyedQuery, Query } from "foldkit/experimental/query"
import { Envelope, EnvelopeHeader, Receipt } from "./loader-envelope"
import { makeResourceKey, type ReadKey } from "./loader-key"
import type * as Update from "../update"
import { webCrypto } from "./web-crypto"

type SyncFields = { readonly [x: PropertyKey]: Schema.Codec<unknown, unknown, never, never> }
type KeyedArgs<Fields extends SyncFields> = Schema.Schema.Type<Schema.Struct<Fields>>

export { Receipt } from "./loader-envelope"
export type { Envelope } from "./loader-envelope"

/** A validated delivery receipt and its application Message. */
export interface Delivery<out Message> {
	readonly receipt: Receipt
	readonly message: Message
}

/** The adapter-facing part of a declaration; heterogeneous payloads stay private. */
export interface Declaration<out Message> extends Pipeable.Pipeable {
	readonly name: string
	readonly decodeDelivery: (envelope: unknown) => Result.Result<Delivery<Message>, Schema.SchemaError>
	readonly decode: (envelope: unknown) => Result.Result<Message, Schema.SchemaError>
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
	return Effect.fnUntraced(function* (effect) {
		const data = yield* effect
		const payload = yield* encode(data)
		const key = yield* Effect.suspend(() => Effect.fromResult(readKey(data)))
		return {
			_tag: EnvelopeHeader.fields._tag.schema.literal,
			format: EnvelopeHeader.fields.format.literal,
			name: config.name,
			key,
			version: yield* Effect.orDie(webCrypto.randomUUIDv4),
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

/** Declares a payload using a schema compatible with Schema.toCodecJson, without running its loading Effect. */
export const define = <A, I>(config: Config<A, I>): Loader<A, Schema.Json> =>
	make(config, (data) => Result.succeed(config.key(data)))

/** Keyed Loader payload: nested Query arguments and an AsyncData outcome. */
export type LoadPayload<Args, A, E> = {
	readonly args: Args
	readonly result: AsyncData.AsyncData<A, E>
}

type KeyedLoadType<Fields extends SyncFields, A, E> = LoadPayload<KeyedArgs<Fields>, A, E>

type LoadType<A, E> = { readonly result: AsyncData.AsyncData<A, E> }

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
	Interrupt extends boolean = boolean,
> extends WithLoadSchema<KeyedLoadType<Fields, A, E>, Schema.Json, LoadSchema> {
	readonly query: KeyedQuery<Name, A, AI, E, EI, Fields, R, Interrupt>
	readonly loadQuery: (args: KeyedArgs<Fields>) => Effect.Effect<Envelope<Schema.Json>, Schema.SchemaError, R>
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
	Interrupt extends boolean = boolean,
> extends WithLoadSchema<LoadType<A, E>, Schema.Json, LoadSchema> {
	readonly query: Query<Name, A, AI, E, EI, R, Interrupt>
	readonly loadQuery: Effect.Effect<Envelope<Schema.Json>, Schema.SchemaError, R>
}

interface KeyedLoadProgram<Args, I, R> {
	readonly loadQuery: (args: Args) => Effect.Effect<Envelope<I>, Schema.SchemaError, R>
}

/** Runs the bound keyed QueryLoader. Data-first or data-last; encoded types and services are preserved. */
export const loadQuery: {
	<Args>(args: Args): <I, R>(self: KeyedLoadProgram<Args, I, R>) => Effect.Effect<Envelope<I>, Schema.SchemaError, R>
	<Args, I, R>(
		self: KeyedLoadProgram<Args, I, R>,
		args: NoInfer<Args>
	): Effect.Effect<Envelope<I>, Schema.SchemaError, R>
} = Function.dual(2, <Args, I, R>(self: KeyedLoadProgram<Args, I, R>, args: Args) => self.loadQuery(args))

type QueryLoadSchema<A, AI, E, EI> = Schema.Struct<{
	readonly result: Schema.Codec<AsyncData.AsyncData<A, E>, AsyncData.AsyncDataEncoded<AI, EI>>
}>

type KeyedQueryLoadSchema<Fields extends SyncFields, A, AI, E, EI> = Schema.Struct<
	{ readonly args: Schema.Struct<Fields> } & QueryLoadSchema<A, AI, E, EI>["fields"]
>

/** Delivery identity overrides; serialization always comes from the Query Model. */
export interface FromQueryOptions {
	readonly name?: string
}

/** A keyed Query derives its resource identity from canonical encoded arguments unless overridden. */
export interface FromKeyedQueryOptions<Args> extends FromQueryOptions {
	/** Receives decoded arguments, never the fetched outcome. */
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
 * Derives serialization from the Query Model. Defaults to Fetch.name and a canonical
 * JSON encoding of keyed args ("singleton" for plain Queries). Loader identity is
 * independent of Query's cache key; name and key overrides are optional.
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

/** Freshness policy for applying a Loader outcome to a Foldkit Query. */
export interface SettleQueryIfOptions<A, E> {
	readonly fresher: (incoming: A, current: A) => boolean
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
			complete(model: Model, result: Result.Result<A, E>) {
				// Model and Message share the conditional instanceId field; TS cannot correlate Interrupt.
				const message = {
					_tag: "CompletedFetch",
					args,
					generation: model.generation,
					result,
					...(Predicate.hasProperty(model, "instanceId") ? { instanceId: model.instanceId } : {}),
				} as Completed
				return query.update(model, message).model
			},
		})
	}
	const [query, model, result, options] = input
	type Model = typeof query.Model.Type
	type Completed = Extract<typeof query.Message.Type, { readonly _tag: "CompletedFetch" }>
	return settle(model, query.read(model), result, options, {
		clear: query.reset,
		loadIfMissing: (model) => query.loadIfMissing(model).model,
		revalidate: (model) => query.revalidate(model).model,
		complete(model: Model, result: Result.Result<A, E>) {
			// Model and Message share the conditional instanceId field; TS cannot correlate Interrupt.
			const message: Completed = {
				_tag: "CompletedFetch",
				generation: model.generation,
				result,
				...(Predicate.hasProperty(model, "instanceId") ? { instanceId: model.instanceId } : {}),
			}
			return query.update(model, message).model
		},
	})
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
