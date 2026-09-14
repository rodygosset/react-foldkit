import {
	Array,
	Effect,
	Function,
	HashMap,
	HashSet,
	Match,
	Option,
	Order,
	Predicate,
	Record,
	Schema,
	Stream,
	pipe,
} from "effect"
import * as AsyncData from "./asyncData"
import * as Command from "./command"
import { defineMessageUnion } from "./message"
import { makeConstrainedEvo } from "./struct"
import * as Subscription from "./subscription"
import * as Update from "./update"

type Policy = "loadIfMissing" | "revalidate" | "revalidateOrLoad"

type FoldLens<ParentModel, ParentMessage, ChildModel, ChildMessage> = Pick<
	Update.ChildFold<ParentModel, ParentMessage, ChildModel, never, ChildMessage>,
	"read" | "write" | "toParentMessage"
>

type ChildField<ParentModel, ChildModel> = {
	[K in keyof ParentModel]: ParentModel[K] extends ChildModel ? K : never
}[keyof ParentModel] &
	string

export type ParentMessage<Message extends Schema.Top> = {
	readonly message: Message
}

export type ParentMessageValue<ChildMessage> = {
	readonly message: ChildMessage
}

type GotWrapper<ChildMessage, ParentMessage> = (fields: ParentMessageValue<ChildMessage>) => ParentMessage

type FoldGot<ParentModel, ParentMessage, ChildMessage, R> = {
	(
		model: ParentModel,
		fields: ParentMessageValue<ChildMessage>
	): Update.Return<ParentModel, ParentMessage, R>
	(
		model: ParentModel
	): (fields: ParentMessageValue<ChildMessage>) => Update.Return<ParentModel, ParentMessage, R>
}

type FieldFoldConfig<ParentModel, ParentMessage, ChildModel, ChildMessage> = Readonly<{
	field: ChildField<ParentModel, ChildModel>
	toParentMessage: GotWrapper<ChildMessage, ParentMessage>
}>

type MissingParentModelFieldConfig = {
	readonly field: never
	readonly toParentMessage: never
}

type FoldChildConfig<ParentModel, ParentMessage, ChildModel, ChildMessage> =
	| FoldLens<ParentModel, ParentMessage, ChildModel, ChildMessage>
	| FieldFoldConfig<ParentModel, ParentMessage, ChildModel, ChildMessage>

type FoldChildField<ChildModel, ChildMessage, R> = {
	<ParentModel, ParentMessage>(
		config: FoldLens<ParentModel, ParentMessage, ChildModel, ChildMessage>
	): Fold.Field<ParentModel, ParentMessage, ChildMessage, R>
	<ParentModel = never, ParentMessage = never>(): [ParentMessage] extends [never]
		? <InferredParentMessage>(
				config: [ParentModel] extends [never]
					? MissingParentModelFieldConfig
					: FieldFoldConfig<ParentModel, InferredParentMessage, ChildModel, ChildMessage>
			) => Fold.Field<ParentModel, InferredParentMessage, ChildMessage, R>
		: (
				config: [ParentModel] extends [never]
					? MissingParentModelFieldConfig
					: FieldFoldConfig<ParentModel, ParentMessage, ChildModel, ChildMessage>
			) => Fold.Field<ParentModel, ParentMessage, ChildMessage, R>
}

type FoldChildKeyed<ChildModel, ChildMessage, Args, R> = {
	<ParentModel, ParentMessage>(
		config: FoldLens<ParentModel, ParentMessage, ChildModel, ChildMessage>
	): Fold.Keyed<ParentModel, ParentMessage, ChildMessage, Args, R>
	<ParentModel = never, ParentMessage = never>(): [ParentMessage] extends [never]
		? <InferredParentMessage>(
				config: [ParentModel] extends [never]
					? MissingParentModelFieldConfig
					: FieldFoldConfig<ParentModel, InferredParentMessage, ChildModel, ChildMessage>
			) => Fold.Keyed<ParentModel, InferredParentMessage, ChildMessage, Args, R>
		: (
				config: [ParentModel] extends [never]
					? MissingParentModelFieldConfig
					: FieldFoldConfig<ParentModel, ParentMessage, ChildModel, ChildMessage>
			) => Fold.Keyed<ParentModel, ParentMessage, ChildMessage, Args, R>
}

function isFieldFoldConfig<ParentModel, ParentMessage, ChildModel, ChildMessage>(
	config: FoldChildConfig<ParentModel, ParentMessage, ChildModel, ChildMessage>
): config is Extract<
	FoldChildConfig<ParentModel, ParentMessage, ChildModel, ChildMessage>,
	{ readonly field: string }
> {
	return Predicate.hasProperty(config, "field")
}

function resolveFoldLens<ParentModel, ParentMessage, ChildModel, ChildMessage>(
	config: FoldChildConfig<ParentModel, ParentMessage, ChildModel, ChildMessage>
): FoldLens<ParentModel, ParentMessage, ChildModel, ChildMessage> {
	if (!isFieldFoldConfig(config)) return config

	const field = config.field
	const evolve = makeConstrainedEvo<ParentModel & globalThis.Record<string, unknown>>()

	return {
		read: (model: ParentModel) => Option.some(model[field as keyof ParentModel] as ChildModel),
		write: (model: ParentModel, nextChild: ChildModel) =>
			evolve(
				model as ParentModel & globalThis.Record<string, unknown>,
				{
					[field]: () => nextChild,
				} as unknown as Parameters<typeof evolve>[1]
			),
		toParentMessage: function (childMessage: ChildMessage) {
			return config.toParentMessage({ message: childMessage })
		},
	}
}

const attachFold = <FoldFn extends object, Policies extends object>(
	fold: FoldFn,
	policies: Policies
): FoldFn & Policies => Object.assign(fold, policies)

function foldGot<ParentModel, ParentMessage, ChildMessage, R>(
	fold: Update.Fold<ParentModel, ParentMessage, ChildMessage, R>
): FoldGot<ParentModel, ParentMessage, ChildMessage, R> {
	function foldCall(
		model: ParentModel,
		fields: ParentMessageValue<ChildMessage>
	): Update.Return<ParentModel, ParentMessage, R>
	function foldCall(
		model: ParentModel
	): (fields: ParentMessageValue<ChildMessage>) => Update.Return<ParentModel, ParentMessage, R>
	function foldCall(model: ParentModel, fields?: ParentMessageValue<ChildMessage>) {
		if (fields !== undefined) {
			return fold(model, fields.message)
		}

		return function (nextFields: ParentMessageValue<ChildMessage>) {
			return fold(model, nextFields.message)
		}
	}

	return foldCall
}

const foldChildFromInform = <ParentModel, ParentMessage, ChildModel, ChildMessage, Input, R>(
	inform: Update.Fold<ChildModel, ChildMessage, Input, R>,
	lens: FoldLens<ParentModel, ParentMessage, ChildModel, ChildMessage>
): Update.Fold<ParentModel, ParentMessage, Input, R> =>
	Update.foldChild({
		update: (childModel: ChildModel, input: Input) => inform(childModel, input),
		...lens,
	})

// NOTE: Nested Command.Interruptible.Outcome in defineMessageUnion collapses
// through tsup to `node_modules/foldkit/dist/schema` (and sometimes
// `outcome?: any`). Tags match Outcome.
const FetchInterruptOutcome = defineMessageUnion({
	Interrupted: {},
	NotFound: {},
})

type Transition = <A, E>(data: AsyncData.AsyncData<A, E>) => Option.Option<AsyncData.AsyncData<A, E>>

const transitionFor = (policy: Policy): Transition =>
	Match.value(policy).pipe(
		Match.when("loadIfMissing", () => AsyncData.loadIfMissing),
		Match.when("revalidate", () => AsyncData.revalidate),
		Match.when("revalidateOrLoad", () => AsyncData.revalidateOrLoad),
		Match.exhaustive
	)

type CacheStore<Model, Args, A, E, Message, R> = Readonly<{
	read: (model: Model, args: Args) => AsyncData.AsyncData<A, E>
	write: (model: Model, args: Args, data: AsyncData.AsyncData<A, E>) => Model
	load: (args: Args) => Command.Command<Message, never, R>
	interrupt: (args: Args) => Command.Command<Message, never, R>
}>

const applyPolicy = <Model, Args, A, E, Message, R>(
	store: CacheStore<Model, Args, A, E, Message, R>,
	model: Model,
	args: Args,
	policy: Policy
): Update.Return<Model, Message, R> =>
	Option.match(transitionFor(policy)(store.read(model, args)), {
		onNone: () => ({ model }),
		onSome: (nextData) => ({
			model: store.write(model, args, nextData),
			commands: [store.load(args)],
		}),
	})

function replaceSlot<Model, Args, A, E, Message, R>(
	store: CacheStore<Model, Args, A, E, Message, R>,
	model: Model,
	args: Args
): Update.Return<Model, Message, R> {
	if (!AsyncData.isPending(store.read(model, args))) return applyPolicy(store, model, args, "revalidateOrLoad")

	return {
		model,
		commands: [store.interrupt(args)],
	}
}

const completeCancel = <Model, Args, A, E, Message, R>(
	store: CacheStore<Model, Args, A, E, Message, R>,
	model: Model,
	args: Args,
	outcome: Command.Interruptible.Outcome
): Update.Return<Model, Message, R> =>
	Command.Interruptible.Outcome.match<Update.Return<Model, Message, R>>(outcome, {
		Interrupted: () => ({ model, commands: [store.load(args)] }),
		NotFound: () => applyPolicy(store, model, args, "revalidateOrLoad"),
	})

const runExecute = <A, E, R>(execute: Effect.Effect<A, E, R>): Effect.Effect<AsyncData.AsyncData<A, E>, never, R> =>
	pipe(
		execute,
		Effect.result,
		Effect.map((result) => AsyncData.settle(AsyncData.Loading(), result))
	)

type FieldConfig<Name extends string, A, AI, E, EI, R> = Readonly<{
	name: Name
	data: Schema.Codec<A, AI>
	error: Schema.Codec<E, EI>
	execute: Effect.Effect<A, E, R>
}>

type KeyedConfig<
	Name extends string,
	A,
	AI,
	E,
	EI,
	Fields extends Schema.Struct.Fields,
	KeyField extends keyof Schema.Schema.Type<Schema.Struct<Fields>> & string,
	R,
> = Readonly<{
	name: Name
	data: Schema.Codec<A, AI>
	error: Schema.Codec<E, EI>
	args: Fields
	keyFields?: Array.NonEmptyReadonlyArray<KeyField>
	toKey?: (args: Pick<Schema.Schema.Type<Schema.Struct<Fields>>, KeyField>) => string
	execute: (args: Schema.Schema.Type<Schema.Struct<Fields>>) => Effect.Effect<A, E, R>
}>

type DefineConfig =
	| (FieldConfig<string, any, any, any, any, any> & { readonly args?: never; readonly toKey?: never })
	| KeyedConfig<string, any, any, any, any, any, any, any>

const isKeyedConfig = (config: DefineConfig): config is KeyedConfig<string, any, any, any, any, any, any, any> =>
	Predicate.hasProperty(config, "args")

type FieldModel<A, AI, E, EI> = Schema.Codec<AsyncData.AsyncData<A, E>, AsyncData.AsyncDataEncoded<AI, EI>>

type SettledFetchOf<Message extends Schema.Top> = Extract<Message["Type"], { readonly _tag: "SettledFetch" }>

type KeyedArgs<Fields extends Schema.Struct.Fields> = Schema.Schema.Type<Schema.Struct<Fields>>

type KeyedKeyArgs<
	Fields extends Schema.Struct.Fields,
	KeyField extends keyof Schema.Schema.Type<Schema.Struct<Fields>> & string,
> = Pick<Schema.Schema.Type<Schema.Struct<Fields>>, KeyField>

export namespace Fold {
	export type Field<ParentModel, ParentMessage, ChildMessage, R = never> = FoldGot<
		ParentModel,
		ParentMessage,
		ChildMessage,
		R
	> &
		Readonly<{
			revalidate: Update.Step<ParentModel, ParentMessage, R>
			revalidateOrLoad: Update.Step<ParentModel, ParentMessage, R>
			loadIfMissing: Update.Step<ParentModel, ParentMessage, R>
			replace: Update.Step<ParentModel, ParentMessage, R>
			watch: Update.Step<ParentModel, ParentMessage, R>
			forget: Update.Step<ParentModel, ParentMessage, R>
			watchSubscription: (
				entry: Subscription.EntryBuilder<ParentModel, ParentMessage, R>,
				modelToIsWatching: (model: ParentModel) => boolean
			) => Subscription.EntryWithoutKeepAlive<ParentModel, ParentMessage, { readonly isWatching: boolean }, R>
		}>

	export type Keyed<ParentModel, ParentMessage, ChildMessage, Args, R = never> = FoldGot<
		ParentModel,
		ParentMessage,
		ChildMessage,
		R
	> &
		Readonly<{
			revalidate: Update.Fold<ParentModel, ParentMessage, Args, R>
			revalidateOrLoad: Update.Fold<ParentModel, ParentMessage, Args, R>
			loadIfMissing: Update.Fold<ParentModel, ParentMessage, Args, R>
			replace: Update.Fold<ParentModel, ParentMessage, Args, R>
			watch: Update.Fold<ParentModel, ParentMessage, ReadonlyArray<Args>, R>
			forget: Update.Fold<ParentModel, ParentMessage, Args, R>
			watchSubscription: (
				entry: Subscription.EntryBuilder<ParentModel, ParentMessage, R>,
				modelToArgs: (model: ParentModel) => ReadonlyArray<Args>
			) => Subscription.EntryWithoutKeepAlive<
				ParentModel,
				ParentMessage,
				{ readonly args: ReadonlyArray<Args> },
				R
			>
		}>
}

/** Single-slot remote-data Submodel. `Model` is the `AsyncData` codec. */
export interface Field<Name extends string, Model extends Schema.Top, Message extends Schema.Top, R = never> {
	readonly Model: Model
	readonly Message: Message
	readonly ParentMessage: ParentMessage<Message>
	readonly Fetch: Command.Interruptible.DefinitionNoArgs<
		`Fetch${Name}`,
		Effect.Effect<SettledFetchOf<Message>, never, R>
	>
	readonly init: () => Model["Type"]
	readonly update: (
		model: Model["Type"],
		message: Message["Type"]
	) => Update.Return<Model["Type"], Message["Type"], R>
	readonly informRevalidate: (model: Model["Type"]) => Update.Return<Model["Type"], Message["Type"], R>
	readonly informRevalidateOrLoad: (model: Model["Type"]) => Update.Return<Model["Type"], Message["Type"], R>
	readonly informLoadIfMissing: (model: Model["Type"]) => Update.Return<Model["Type"], Message["Type"], R>
	readonly informReplace: (model: Model["Type"]) => Update.Return<Model["Type"], Message["Type"], R>
	readonly informWatch: (model: Model["Type"]) => Update.Return<Model["Type"], Message["Type"], R>
	readonly informForget: (model: Model["Type"]) => Update.Return<Model["Type"], Message["Type"], R>
	readonly foldChild: FoldChildField<Model["Type"], Message["Type"], R>
	readonly watchSubscription: <ParentModel, ParentMessage>(
		entry: Subscription.EntryBuilder<ParentModel, ParentMessage, R>,
		config: {
			readonly toParentMessage: (message: Message["Type"]) => ParentMessage
			readonly modelToIsWatching: (model: ParentModel) => boolean
		}
	) => Subscription.EntryWithoutKeepAlive<ParentModel, ParentMessage, { readonly isWatching: boolean }, R>
	readonly run: Effect.Effect<Model["Type"], never, R>
}

export namespace Field {
	export type Any = Pick<Field<string, Schema.Top, Schema.Top>, "Model" | "Message" | "init">
}

/** Keyed remote-data Submodel. `Model` is a `HashMap` of `{ args, data }` slots. */
export interface Keyed<
	Name extends string,
	Model extends Schema.Top,
	Message extends Schema.Top,
	Fields extends Schema.Struct.Fields,
	KeyField extends keyof Schema.Schema.Type<Schema.Struct<Fields>> & string,
	Data,
	R = never,
> {
	readonly Model: Model
	readonly Message: Message
	readonly ParentMessage: ParentMessage<Message>
	readonly Fetch: Command.Interruptible.DefinitionWithArgs<
		`Fetch${Name}`,
		Fields,
		KeyedKeyArgs<Fields, KeyField>,
		Effect.Effect<SettledFetchOf<Message>, never, R>
	>
	readonly init: () => Model["Type"]
	readonly read: (model: Model["Type"], args: KeyedArgs<Fields>) => Data
	readonly update: (
		model: Model["Type"],
		message: Message["Type"]
	) => Update.Return<Model["Type"], Message["Type"], R>
	readonly informRevalidate: Update.Fold<Model["Type"], Message["Type"], KeyedArgs<Fields>, R>
	readonly informRevalidateOrLoad: Update.Fold<Model["Type"], Message["Type"], KeyedArgs<Fields>, R>
	readonly informLoadIfMissing: Update.Fold<Model["Type"], Message["Type"], KeyedArgs<Fields>, R>
	readonly informReplace: Update.Fold<Model["Type"], Message["Type"], KeyedArgs<Fields>, R>
	readonly informWatch: Update.Fold<Model["Type"], Message["Type"], ReadonlyArray<KeyedArgs<Fields>>, R>
	readonly informForget: Update.Fold<Model["Type"], Message["Type"], KeyedArgs<Fields>, R>
	readonly foldChild: FoldChildKeyed<Model["Type"], Message["Type"], KeyedArgs<Fields>, R>
	readonly watchSubscription: <ParentModel, ParentMessage>(
		entry: Subscription.EntryBuilder<ParentModel, ParentMessage, R>,
		config: {
			readonly toParentMessage: (message: Message["Type"]) => ParentMessage
			readonly modelToArgs: (model: ParentModel) => ReadonlyArray<KeyedArgs<Fields>>
		}
	) => Subscription.EntryWithoutKeepAlive<
		ParentModel,
		ParentMessage,
		{ readonly args: ReadonlyArray<KeyedArgs<Fields>> },
		R
	>
	readonly run: (args: KeyedArgs<Fields>) => Effect.Effect<Data, never, R>
}

export namespace Keyed {
	export type Any = Pick<
		Keyed<string, Schema.Top, Schema.Top, Schema.Struct.Fields, string, unknown>,
		"Model" | "Message" | "init"
	>
}

function defineField<Name extends string, A, AI, E, EI, R>(config: FieldConfig<Name, A, AI, E, EI, R>) {
	const Data = AsyncData.Schema(config.data, config.error)

	const Message = defineMessageUnion({
		RequestedRevalidate: {},
		RequestedRevalidateOrLoad: {},
		RequestedLoadIfMissing: {},
		RequestedReplace: {},
		RequestedWatch: {},
		RequestedForget: {},
		SettledFetch: { result: Schema.Result(config.data, config.error) },
		CompletedCancelFetch: { outcome: FetchInterruptOutcome },
	})
	type Message = typeof Message.Type

	const Fetch = Command.define(`Fetch${config.name}`, {
		messages: [Message.SettledFetch],
		interrupt: true,
		execute: pipe(
			config.execute,
			Effect.result,
			Effect.map((result) => Message.SettledFetch({ result }))
		),
	})

	type Model = AsyncData.AsyncData<A, E>
	type Args = undefined
	type UpdateReturn = Update.Return<Model, Message, R>

	const store: CacheStore<Model, Args, A, E, Message, R> = {
		read: (model) => model,
		write: (_model, _args, data) => data,
		load: () => Fetch(),
		interrupt: () => Fetch.Interrupt((outcome) => Message.CompletedCancelFetch({ outcome })),
	}

	const hasSlot = (model: Model): boolean => !AsyncData.isIdle(model)

	function forgetSlot(model: Model): UpdateReturn {
		if (AsyncData.isIdle(model)) return { model }

		if (AsyncData.isPending(model)) return { model: AsyncData.Idle(), commands: [store.interrupt(undefined)] }

		return { model: AsyncData.Idle() }
	}

	const update = (model: Model, message: Message): UpdateReturn =>
		Message.match<UpdateReturn>(message, {
			RequestedRevalidate: () => applyPolicy(store, model, undefined, "revalidate"),
			RequestedRevalidateOrLoad: () => applyPolicy(store, model, undefined, "revalidateOrLoad"),
			RequestedLoadIfMissing: () => applyPolicy(store, model, undefined, "loadIfMissing"),
			RequestedReplace: () => replaceSlot(store, model, undefined),
			RequestedWatch: () => applyPolicy(store, model, undefined, "loadIfMissing"),
			RequestedForget: () => forgetSlot(model),
			SettledFetch: ({ result }) => {
				if (!hasSlot(model)) {
					return { model }
				}
				return {
					model: store.write(model, undefined, AsyncData.settle(store.read(model, undefined), result)),
				}
			},
			CompletedCancelFetch: ({ outcome }) => {
				if (!hasSlot(model)) {
					return { model }
				}
				return completeCancel(store, model, undefined, outcome)
			},
		})

	const informRevalidate = (model: Model): UpdateReturn => update(model, Message.RequestedRevalidate())
	const informRevalidateOrLoad = (model: Model): UpdateReturn => update(model, Message.RequestedRevalidateOrLoad())
	const informLoadIfMissing = (model: Model): UpdateReturn => update(model, Message.RequestedLoadIfMissing())
	const informReplace = (model: Model): UpdateReturn => update(model, Message.RequestedReplace())
	const informWatch = (model: Model): UpdateReturn => update(model, Message.RequestedWatch())
	const informForget = (model: Model): UpdateReturn => update(model, Message.RequestedForget())

	const init = (): Model => AsyncData.Idle()

	const watchFieldSubscription = <ParentModel, ParentMessage>(
		entry: Subscription.EntryBuilder<ParentModel, ParentMessage, R>,
		toParentMessage: (message: Message) => ParentMessage,
		modelToIsWatching: (model: ParentModel) => boolean
	) =>
		entry(
			{ isWatching: Schema.Boolean },
			{
				modelToDependencies: (parent: ParentModel) => ({ isWatching: modelToIsWatching(parent) }),
				dependenciesToStream: ({ isWatching }: { readonly isWatching: boolean }) =>
					Stream.succeed(toParentMessage(isWatching ? Message.RequestedWatch() : Message.RequestedForget())),
			}
		)

	const foldFromLens = function <ParentModel, ParentMessage>(
		foldConfig: FoldLens<ParentModel, ParentMessage, Model, Message>
	) {
		return attachFold(foldGot(Update.foldChild({ update, ...foldConfig })), {
			revalidate: Update.foldChildStep({ update: informRevalidate, ...foldConfig }),
			revalidateOrLoad: Update.foldChildStep({ update: informRevalidateOrLoad, ...foldConfig }),
			loadIfMissing: Update.foldChildStep({ update: informLoadIfMissing, ...foldConfig }),
			replace: Update.foldChildStep({ update: informReplace, ...foldConfig }),
			watch: Update.foldChildStep({ update: informWatch, ...foldConfig }),
			forget: Update.foldChildStep({ update: informForget, ...foldConfig }),
			watchSubscription: (
				entry: Subscription.EntryBuilder<ParentModel, ParentMessage, R>,
				modelToIsWatching: (model: ParentModel) => boolean
			) => watchFieldSubscription(entry, foldConfig.toParentMessage, modelToIsWatching),
		})
	}

	const foldChild = function <ParentModel, ParentMessage>(
		config?: FoldChildConfig<ParentModel, ParentMessage, Model, Message>
	) {
		if (arguments.length === 0) {
			return function (fieldConfig: FieldFoldConfig<ParentModel, ParentMessage, Model, Message>) {
				return foldFromLens(resolveFoldLens(fieldConfig))
			}
		}
		return foldFromLens(resolveFoldLens(config as FoldChildConfig<ParentModel, ParentMessage, Model, Message>))
	} as FoldChildField<Model, Message, R>

	const watchSubscription = <ParentModel, ParentMessage>(
		entry: Subscription.EntryBuilder<ParentModel, ParentMessage, R>,
		watchConfig: {
			readonly toParentMessage: (message: Message) => ParentMessage
			readonly modelToIsWatching: (model: ParentModel) => boolean
		}
	) => watchFieldSubscription(entry, watchConfig.toParentMessage, watchConfig.modelToIsWatching)

	const run = runExecute(config.execute)

	return {
		Model: Data.schema,
		Message,
		ParentMessage: { message: Message },
		Fetch,
		init,
		update,
		informRevalidate,
		informRevalidateOrLoad,
		informLoadIfMissing,
		informReplace,
		informWatch,
		informForget,
		foldChild,
		watchSubscription,
		run,
	} satisfies Field<Name, typeof Data.schema, typeof Message, R>
}

function defineKeyed<
	Name extends string,
	A,
	AI,
	E,
	EI,
	Fields extends Schema.Struct.Fields,
	KeyField extends keyof Schema.Schema.Type<Schema.Struct<Fields>> & string,
	R,
>(config: KeyedConfig<Name, A, AI, E, EI, Fields, KeyField, R>) {
	const Data = AsyncData.Schema(config.data, config.error)
	type Data = typeof Data.schema.Type
	const Args = Schema.Struct(config.args)
	type Args = typeof Args.Type
	const argsKeys = Record.keys(config.args)
	if (!Array.isArrayNonEmpty(argsKeys))
		throw new Error(`Query.define("${config.name}"): keyed args must include at least one field`)

	const keyFields: Array.NonEmptyReadonlyArray<KeyField> =
		config.keyFields ?? (argsKeys as unknown as Array.NonEmptyReadonlyArray<KeyField>)
	const toKey: (keyArgs: Pick<Args, KeyField>) => string =
		config.toKey ??
		function (keyArgs: Pick<Args, KeyField>): string {
			return Array.join(
				Array.map(keyFields, (key) => globalThis.String(keyArgs[key])),
				":"
			)
		}
	const Slot = Schema.Struct({
		args: Args,
		data: Data.schema,
	})
	type Slot = typeof Slot.Type

	const Message = defineMessageUnion({
		RequestedRevalidate: { args: Args },
		RequestedRevalidateOrLoad: { args: Args },
		RequestedLoadIfMissing: { args: Args },
		RequestedReplace: { args: Args },
		RequestedWatch: { live: Schema.HashMap(Schema.String, Args) },
		RequestedForget: { args: Args },
		SettledFetch: { args: Args, result: Schema.Result(config.data, config.error) },
		CompletedCancelFetch: {
			args: Args,
			outcome: FetchInterruptOutcome,
		},
	})
	type Message = typeof Message.Type
	type MessageArgs = Parameters<typeof Message.RequestedRevalidate>[0]["args"]
	const toMessageArgs = (args: Args): MessageArgs => args as MessageArgs

	const Fetch = Command.define(`Fetch${config.name}`, {
		args: config.args,
		messages: [Message.SettledFetch],
		interrupt: {
			keyFields,
			toKey,
		},
		execute: (args: Args) =>
			pipe(
				config.execute(args),
				Effect.result,
				Effect.map((result) => Message.SettledFetch({ args: toMessageArgs(args), result }))
			),
	})

	type Model = HashMap.HashMap<string, Slot>
	type UpdateReturn = Update.Return<Model, Message, R>
	type UpdateStep = Update.Step<Model, Message, R>

	const store: CacheStore<Model, Args, A, E, Message, R> = {
		read: (model, args) =>
			AsyncData.fromOptionOrIdle(Option.map(HashMap.get(model, toKey(args)), (slot) => slot.data)),
		write: (model, args, data) => HashMap.set(model, toKey(args), { args, data }),
		load: (args) => Fetch(args),
		interrupt: (args) =>
			Fetch.Interrupt(args, (outcome) => Message.CompletedCancelFetch({ args: toMessageArgs(args), outcome })),
	}

	const hasSlot = (model: Model, args: Args): boolean => HashMap.has(model, toKey(args))

	function forgetSlot(model: Model, args: Args): UpdateReturn {
		if (!hasSlot(model, args)) return { model }

		const nextModel = HashMap.remove(model, toKey(args))
		if (AsyncData.isPending(store.read(model, args))) return { model: nextModel, commands: [store.interrupt(args)] }

		return { model: nextModel }
	}

	function watchSlots(model: Model, liveArgs: ReadonlyArray<Args>): UpdateReturn {
		const liveKeys = HashSet.fromIterable(Array.map(liveArgs, (args) => toKey(args)))
		const forgetExtras = HashMap.reduce(model, Array.empty<UpdateStep>(), (steps, slot, key) =>
			HashSet.has(liveKeys, key) ? steps : Array.append(steps, (current: Model) => forgetSlot(current, slot.args))
		)
		const loadLive = Array.map(
			liveArgs,
			(args): UpdateStep =>
				(current) =>
					applyPolicy(store, current, args, "loadIfMissing")
		)
		return Update.combine(model, Array.appendAll(forgetExtras, loadLive))
	}

	const update = (model: Model, message: Message): UpdateReturn =>
		Message.match<UpdateReturn>(message, {
			RequestedRevalidate: ({ args }) => applyPolicy(store, model, args, "revalidate"),
			RequestedRevalidateOrLoad: ({ args }) => applyPolicy(store, model, args, "revalidateOrLoad"),
			RequestedLoadIfMissing: ({ args }) => applyPolicy(store, model, args, "loadIfMissing"),
			RequestedReplace: ({ args }) => replaceSlot(store, model, args),
			RequestedWatch: ({ live }) => watchSlots(model, HashMap.toValues(live)),
			RequestedForget: ({ args }) => forgetSlot(model, args),
			SettledFetch: ({ args, result }) => {
				if (!hasSlot(model, args)) {
					return { model }
				}
				return {
					model: store.write(model, args, AsyncData.settle(store.read(model, args), result)),
				}
			},
			CompletedCancelFetch: ({ args, outcome }) => {
				if (!hasSlot(model, args)) {
					return { model }
				}
				return completeCancel(store, model, args, outcome)
			},
		})

	const inform = (build: (args: MessageArgs) => Message): Update.Fold<Model, Message, Args, R> =>
		Function.dual(2, (model: Model, args: Args): UpdateReturn => update(model, build(toMessageArgs(args))))

	const informRevalidate = inform((args) => Message.RequestedRevalidate({ args }))
	const informRevalidateOrLoad = inform((args) => Message.RequestedRevalidateOrLoad({ args }))
	const informLoadIfMissing = inform((args) => Message.RequestedLoadIfMissing({ args }))
	const informReplace = inform((args) => Message.RequestedReplace({ args }))
	const informForget = inform((args) => Message.RequestedForget({ args }))
	const toWatchMessage = (liveArgs: ReadonlyArray<Args>): Message =>
		Message.RequestedWatch({
			live: HashMap.fromIterable(Array.map(liveArgs, (args) => [toKey(args), args] as const)),
		})
	const informWatch: Update.Fold<Model, Message, ReadonlyArray<Args>, R> = Function.dual(
		2,
		(model: Model, liveArgs: ReadonlyArray<Args>): UpdateReturn => update(model, toWatchMessage(liveArgs))
	)

	const init = (): Model => HashMap.empty()
	const read = (model: Model, args: Args): Data => store.read(model, args)

	const foldFromLens = function <ParentModel, ParentMessage>(
		foldConfig: FoldLens<ParentModel, ParentMessage, Model, Message>
	) {
		return attachFold(foldGot(Update.foldChild({ update, ...foldConfig })), {
			revalidate: foldChildFromInform(informRevalidate, foldConfig),
			revalidateOrLoad: foldChildFromInform(informRevalidateOrLoad, foldConfig),
			loadIfMissing: foldChildFromInform(informLoadIfMissing, foldConfig),
			replace: foldChildFromInform(informReplace, foldConfig),
			watch: foldChildFromInform(informWatch, foldConfig),
			forget: foldChildFromInform(informForget, foldConfig),
			watchSubscription: (
				entry: Subscription.EntryBuilder<ParentModel, ParentMessage, R>,
				modelToArgs: (model: ParentModel) => ReadonlyArray<Args>
			) => watchKeyedSubscription(entry, foldConfig.toParentMessage, modelToArgs),
		})
	}

	const foldChild = function <ParentModel, ParentMessage>(
		config?: FoldChildConfig<ParentModel, ParentMessage, Model, Message>
	) {
		if (arguments.length === 0) {
			return function (fieldConfig: FieldFoldConfig<ParentModel, ParentMessage, Model, Message>) {
				return foldFromLens(resolveFoldLens(fieldConfig))
			}
		}
		return foldFromLens(resolveFoldLens(config as FoldChildConfig<ParentModel, ParentMessage, Model, Message>))
	} as FoldChildKeyed<Model, Message, Args, R>

	const watchKeyedSubscription = <ParentModel, ParentMessage>(
		entry: Subscription.EntryBuilder<ParentModel, ParentMessage, R>,
		toParentMessage: (message: Message) => ParentMessage,
		modelToArgs: (model: ParentModel) => ReadonlyArray<Args>
	) =>
		entry(
			{ args: Schema.Array(Args) },
			{
				modelToDependencies: (parent: ParentModel) => ({
					args: Array.sortWith(modelToArgs(parent), (liveArgs) => toKey(liveArgs), Order.String),
				}),
				dependenciesToStream: ({ args }: { readonly args: ReadonlyArray<Args> }) =>
					Stream.succeed(toParentMessage(toWatchMessage(args))),
			}
		)

	const watchSubscription = <ParentModel, ParentMessage>(
		entry: Subscription.EntryBuilder<ParentModel, ParentMessage, R>,
		watchConfig: {
			readonly toParentMessage: (message: Message) => ParentMessage
			readonly modelToArgs: (model: ParentModel) => ReadonlyArray<Args>
		}
	) => watchKeyedSubscription(entry, watchConfig.toParentMessage, watchConfig.modelToArgs)

	const run = (args: Args): Effect.Effect<Data, never, R> => runExecute(config.execute(args))

	const Model = Schema.HashMap(Schema.String, Slot)

	return {
		Model,
		Message,
		ParentMessage: { message: Message },
		Fetch,
		init,
		read,
		update,
		informRevalidate,
		informRevalidateOrLoad,
		informLoadIfMissing,
		informReplace,
		informWatch,
		informForget,
		foldChild,
		watchSubscription,
		run,
	} satisfies Keyed<Name, typeof Model, typeof Message, Fields, KeyField, Data, R>
}

/** Defines a remote-data Submodel as {@link Field} or {@link Keyed}. */
export function define<Name extends string, A, AI, E, EI, R = never>(
	config: FieldConfig<Name, A, AI, E, EI, R> & { readonly args?: never; readonly toKey?: never }
): Field<Name, FieldModel<A, AI, E, EI>, ReturnType<typeof defineField<Name, A, AI, E, EI, R>>["Message"], R>
export function define<
	Name extends string,
	A,
	AI,
	E,
	EI,
	Fields extends Schema.Struct.Fields,
	KeyField extends keyof Schema.Schema.Type<Schema.Struct<Fields>> & string,
	R = never,
>(
	config: KeyedConfig<Name, A, AI, E, EI, Fields, KeyField, R>
): Keyed<
	Name,
	ReturnType<typeof defineKeyed<Name, A, AI, E, EI, Fields, KeyField, R>>["Model"],
	ReturnType<typeof defineKeyed<Name, A, AI, E, EI, Fields, KeyField, R>>["Message"],
	Fields,
	KeyField,
	AsyncData.AsyncData<A, E>,
	R
>
export function define(config: DefineConfig): unknown {
	if (isKeyedConfig(config)) return defineKeyed(config)

	return defineField(config)
}
