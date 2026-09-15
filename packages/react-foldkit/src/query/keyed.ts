import { Array, Effect, Function, HashMap, HashSet, Option, Order, pipe, Record, Schema, Stream, Struct } from "effect"
import * as AsyncData from "../asyncData"
import * as Command from "../command"
import { defineMessageUnion } from "../message"
import * as Subscription from "../subscription"
import * as Update from "../update"
import {
	applyPolicy,
	asLift,
	attachFold,
	type CacheStore,
	completeCancel,
	FetchInterruptOutcome,
	type FieldFoldConfig,
	foldChildFromInform,
	type FoldLens,
	type KeyedArgs,
	type KeyedKeyArgs,
	type LiftConfig,
	type LiftKeyed,
	type ParentMessage,
	replaceSlot,
	resolveFoldLens,
	runExecute,
	type SettledFetchOf,
} from "./internal"

export type SyncFields = { readonly [x: PropertyKey]: Schema.Codec<unknown, unknown> }

const encodeKey = <S extends Schema.Codec<unknown, unknown>>(schema: S) =>
	schema.pipe(Schema.toCodecJson, Schema.fromJsonString, Schema.encodeUnknownSync)

export type KeyedConfig<
	Name extends string,
	A,
	AI,
	E,
	EI,
	Fields extends SyncFields,
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
	readonly lift: LiftKeyed<Model["Type"], Message["Type"], KeyedArgs<Fields>, R>
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

export function defineKeyed<
	Name extends string,
	A,
	AI,
	E,
	EI,
	Fields extends SyncFields,
	KeyField extends keyof Schema.Schema.Type<Schema.Struct<Fields>> & string,
	R,
>(config: KeyedConfig<Name, A, AI, E, EI, Fields, KeyField, R>) {
	const states = AsyncData.Schema(config.data, config.error)
	type SlotState = typeof states.schema.Type
	const Args = Schema.Struct(config.args)
	type Args = typeof Args.Type
	const argsKeys = Record.keys(config.args)
	if (!Array.isReadonlyArrayNonEmpty(argsKeys))
		throw new Error(`Query.define("${config.name}"): keyed args must include at least one field`)

	const keyFields: Array.NonEmptyReadonlyArray<KeyField> =
		config.keyFields ?? (argsKeys as unknown as Array.NonEmptyReadonlyArray<KeyField>)
	const toKey = config.toKey ?? encodeKey(Args)
	const toInterruptKey = config.toKey ?? encodeKey(Schema.Struct(Struct.pick(config.args, keyFields)))

	const Slot = Schema.Struct({
		args: Args,
		data: states.schema,
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
			toKey: toInterruptKey,
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
	const read = (model: Model, args: Args): SlotState => store.read(model, args)

	const liftFromLens = function <ParentModel, ParentMessage>(
		foldConfig: FoldLens<ParentModel, ParentMessage, Model, Message>
	) {
		return attachFold(asLift(Update.foldChild({ update, ...foldConfig })), {
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

	const lift = function <ParentModel, ParentMessage>(
		config?: LiftConfig<ParentModel, ParentMessage, Model, Message>
	) {
		if (arguments.length === 0)
			return (fieldConfig: FieldFoldConfig<ParentModel, ParentMessage, Model, Message>) =>
				liftFromLens(resolveFoldLens(fieldConfig))

		return liftFromLens(resolveFoldLens(config as LiftConfig<ParentModel, ParentMessage, Model, Message>))
	} as LiftKeyed<Model, Message, Args, R>

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

	const run = (args: Args): Effect.Effect<SlotState, never, R> => runExecute(config.execute(args))

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
		lift,
		watchSubscription,
		run,
	} satisfies Keyed<Name, typeof Model, typeof Message, Fields, KeyField, SlotState, R>
}
