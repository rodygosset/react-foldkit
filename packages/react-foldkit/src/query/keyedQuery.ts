import { Array, Effect, Function, HashMap, HashSet, Number, Option, Order, Record, Schema, Stream, pipe } from "effect"

import * as AsyncData from "foldkit/asyncData"
import type { Interruptible } from "foldkit/command"
import * as Command from "foldkit/command"
import { defineMessageUnion } from "../message"
import { modifyFields } from "foldkit/struct"
import * as Subscription from "../subscription"
import * as Update from "../update"
import {
	type CacheStore,
	CancelIntent,
	FetchInterruptOutcome,
	type FoldLens,
	type KeyedArgs,
	type KeyedLoadPayload,
	type KeyedSettle,
	type KeyedSettleIf,
	type KeyedSettleIfLoad,
	type LiftConfig,
	type LiftKeyedQuery,
	type Lifted,
	type ParentKeyFoldConfig,
	type Policy,
	type SettledFetchOf,
	type SettleIfOptions,
	allocateRequestId,
	applyPolicy,
	completeCancel,
	foldChildFromPolicy,
	isParentKeyFoldConfig,
	parentKeyToLens,
	replaceSlot,
	runExecute,
	sameRequest,
	settleSlot,
	shouldSettle,
	loadArgsFromPayload,
} from "./internal"

export type SyncFields = {
	readonly [x: PropertyKey]: Schema.Codec<unknown, unknown, never, never>
}

export const encodeKey = <S extends Schema.Codec<unknown, unknown>>(schema: S) =>
	schema.pipe(Schema.toCodecJson, Schema.fromJsonString, Schema.encodeUnknownSync)

export type KeyedQueryConfig<Name extends string, A, AI, E, EI, Fields extends SyncFields, R> = Readonly<{
	name: Name
	data: Schema.Codec<A, AI, never, never>
	error: Schema.Codec<E, EI, never, never>
	args: Fields
	toKey?: (args: Schema.Schema.Type<Schema.Struct<Fields>>) => string
	execute: (args: Schema.Schema.Type<Schema.Struct<Fields>>) => Effect.Effect<A, E, R>
	interrupt?: boolean
}>

const makeKeyedQueryMessage = <A, AI, E, EI, Fields extends SyncFields>(
	data: Schema.Codec<A, AI>,
	error: Schema.Codec<E, EI>,
	Args: Schema.Struct<Fields>
) =>
	defineMessageUnion({
		UpdatedWatch: { live: Schema.HashMap(Schema.String, Args) },
		SettledFetch: {
			args: Args,
			instanceId: Schema.String,
			requestId: Schema.Number,
			result: Schema.Result(data, error),
		},
		CompletedCancelFetch: {
			args: Args,
			instanceId: Schema.String,
			requestId: Schema.Number,
			outcome: FetchInterruptOutcome,
			intent: CancelIntent,
		},
	})

export type KeyedQueryMessage<A, AI, E, EI, Fields extends SyncFields> = ReturnType<
	typeof makeKeyedQueryMessage<A, AI, E, EI, Fields>
>

/** Schema for a KeyedQuery's retained slots and request identity. */
export function makeKeyedQueryModel<A, AI, E, EI, Fields extends SyncFields>(
	data: Schema.Codec<A, AI>,
	error: Schema.Codec<E, EI>,
	Args: Schema.Struct<Fields>
) {
	const states = AsyncData.Schema(data, error)
	return Schema.Struct({
		instanceId: Schema.String,
		nextRequestId: Schema.Number,
		slots: Schema.HashMap(
			Schema.String,
			Schema.Struct({
				args: Args,
				data: states.schema,
				maybePendingRequestId: Schema.Option(Schema.Number),
			})
		),
	})
}

export type KeyedQueryModel<A, AI, E, EI, Fields extends SyncFields> = ReturnType<
	typeof makeKeyedQueryModel<A, AI, E, EI, Fields>
>

/** Keyed remote-data Submodel. Read a slot's `AsyncData` with `read`. */
export interface KeyedQuery<
	Name extends string,
	A,
	AI,
	E,
	EI,
	Fields extends SyncFields,
	R = never,
	Interrupt extends boolean = false,
> {
	readonly name: Name
	readonly Args: Schema.Struct<Fields>
	readonly toKey: (args: KeyedArgs<Fields>) => string
	readonly Model: KeyedQueryModel<A, AI, E, EI, Fields>
	readonly Message: KeyedQueryMessage<A, AI, E, EI, Fields>
	readonly Fetch: Interrupt extends true
		? Interruptible.DefinitionWithArgs<
				`Fetch${Name}`,
				{
					instanceId: typeof Schema.String
					requestId: typeof Schema.Number
					queryArgs: Schema.Struct<Fields>
				},
				{ readonly instanceId: string; readonly requestId: number; readonly queryArgs: KeyedArgs<Fields> },
				Effect.Effect<SettledFetchOf<KeyedQueryMessage<A, AI, E, EI, Fields>>, never, R>
			>
		: Command.CommandDefinitionWithArgs<
				`Fetch${Name}`,
				{
					instanceId: typeof Schema.String
					requestId: typeof Schema.Number
					queryArgs: Schema.Struct<Fields>
				},
				Effect.Effect<SettledFetchOf<KeyedQueryMessage<A, AI, E, EI, Fields>>, never, R>
			>
	readonly init: (instanceId: string) => KeyedQueryModel<A, AI, E, EI, Fields>["Type"]
	readonly read: (
		model: KeyedQueryModel<A, AI, E, EI, Fields>["Type"],
		args: KeyedArgs<Fields>
	) => AsyncData.AsyncData<A, E>
	readonly update: (
		model: KeyedQueryModel<A, AI, E, EI, Fields>["Type"],
		message: KeyedQueryMessage<A, AI, E, EI, Fields>["Type"]
	) => Update.Return<
		KeyedQueryModel<A, AI, E, EI, Fields>["Type"],
		KeyedQueryMessage<A, AI, E, EI, Fields>["Type"],
		R
	>
	readonly revalidate: Update.Fold<
		KeyedQueryModel<A, AI, E, EI, Fields>["Type"],
		KeyedQueryMessage<A, AI, E, EI, Fields>["Type"],
		KeyedArgs<Fields>,
		R
	>
	readonly revalidateOrLoad: Update.Fold<
		KeyedQueryModel<A, AI, E, EI, Fields>["Type"],
		KeyedQueryMessage<A, AI, E, EI, Fields>["Type"],
		KeyedArgs<Fields>,
		R
	>
	readonly loadIfMissing: Update.Fold<
		KeyedQueryModel<A, AI, E, EI, Fields>["Type"],
		KeyedQueryMessage<A, AI, E, EI, Fields>["Type"],
		KeyedArgs<Fields>,
		R
	>
	readonly replace: Update.Fold<
		KeyedQueryModel<A, AI, E, EI, Fields>["Type"],
		KeyedQueryMessage<A, AI, E, EI, Fields>["Type"],
		KeyedArgs<Fields>,
		R
	>
	readonly watch: Update.Fold<
		KeyedQueryModel<A, AI, E, EI, Fields>["Type"],
		KeyedQueryMessage<A, AI, E, EI, Fields>["Type"],
		ReadonlyArray<KeyedArgs<Fields>>,
		R
	>
	readonly forget: Update.Fold<
		KeyedQueryModel<A, AI, E, EI, Fields>["Type"],
		KeyedQueryMessage<A, AI, E, EI, Fields>["Type"],
		KeyedArgs<Fields>,
		R
	>
	/** Installs Success/Failure for one slot without fetching or changing siblings. */
	readonly settle: KeyedSettle<
		KeyedQueryModel<A, AI, E, EI, Fields>["Type"],
		KeyedQueryMessage<A, AI, E, EI, Fields>["Type"],
		KeyedArgs<Fields>,
		A,
		E
	>
	/** Settles only when Success is fresher or Failure hits an empty non-pending slot. */
	readonly settleIf: KeyedSettleIf<
		KeyedQueryModel<A, AI, E, EI, Fields>["Type"],
		KeyedQueryMessage<A, AI, E, EI, Fields>["Type"],
		KeyedArgs<Fields>,
		A,
		E
	>
	readonly settleIfLoad: KeyedSettleIfLoad<
		KeyedQueryModel<A, AI, E, EI, Fields>["Type"],
		KeyedQueryMessage<A, AI, E, EI, Fields>["Type"],
		KeyedArgs<Fields>,
		A,
		E
	>
	readonly lift: LiftKeyedQuery<
		KeyedQueryModel<A, AI, E, EI, Fields>["Type"],
		KeyedQueryMessage<A, AI, E, EI, Fields>["Type"],
		KeyedArgs<Fields>,
		R,
		A,
		E
	>
	readonly watchSubscription: <ParentModel, ParentMessage>(
		entry: Subscription.EntryBuilder<ParentModel, ParentMessage, R>,
		config: {
			readonly toParentMessage: (message: KeyedQueryMessage<A, AI, E, EI, Fields>["Type"]) => ParentMessage
			readonly modelToArgs: (model: ParentModel) => ReadonlyArray<KeyedArgs<Fields>>
		}
	) => Subscription.EntryWithoutKeepAlive<
		ParentModel,
		ParentMessage,
		{ readonly args: ReadonlyArray<KeyedArgs<Fields>> },
		R
	>
	readonly run: (args: KeyedArgs<Fields>) => Effect.Effect<AsyncData.AsyncData<A, E>, never, R>
}

export namespace KeyedQuery {
	export type Any = {
		readonly Model: Schema.Top
		readonly Message: Schema.Top
		readonly init: (instanceId: string) => unknown
	}
}

export function defineKeyedQuery<Name extends string, A, AI, E, EI, Fields extends SyncFields, R>(
	config: KeyedQueryConfig<Name, A, AI, E, EI, Fields, R> & {
		readonly interrupt: true
	}
): KeyedQuery<Name, A, AI, E, EI, Fields, R, true>
export function defineKeyedQuery<Name extends string, A, AI, E, EI, Fields extends SyncFields, R>(
	config: KeyedQueryConfig<Name, A, AI, E, EI, Fields, R> & {
		readonly interrupt?: false
	}
): KeyedQuery<Name, A, AI, E, EI, Fields, R, false>
export function defineKeyedQuery<Name extends string, A, AI, E, EI, Fields extends SyncFields, R>(
	config: KeyedQueryConfig<Name, A, AI, E, EI, Fields, R>
): KeyedQuery<Name, A, AI, E, EI, Fields, R, true> | KeyedQuery<Name, A, AI, E, EI, Fields, R, false>
export function defineKeyedQuery<Name extends string, A, AI, E, EI, Fields extends SyncFields, R>(
	config: KeyedQueryConfig<Name, A, AI, E, EI, Fields, R>
): unknown {
	const states = AsyncData.Schema(config.data, config.error)
	type SlotState = typeof states.schema.Type
	const Args = Schema.Struct(config.args)
	type Args = typeof Args.Type
	if (Record.isEmptyReadonlyRecord(config.args)) {
		throw new Error(`Query.define("${config.name}"): keyed args must include at least one field`)
	}

	const toKey = config.toKey ?? encodeKey(Args)
	const encodeInterruptKey = encodeKey(Schema.Tuple([Schema.String, Schema.String, Schema.Number]))

	const Message = makeKeyedQueryMessage(config.data, config.error, Args)
	type Message = KeyedQueryMessage<A, AI, E, EI, Fields>["Type"]

	const FetchArgs = {
		instanceId: Schema.String,
		requestId: Schema.Number,
		queryArgs: Args,
	}

	const executeFetch = (args: Readonly<{ instanceId: string; requestId: number; queryArgs: Args }>) =>
		pipe(
			config.execute(args.queryArgs),
			Effect.result,
			Effect.map(function (result): typeof Message.SettledFetch.Type {
				return {
					_tag: "SettledFetch",
					args: args.queryArgs,
					instanceId: args.instanceId,
					requestId: args.requestId,
					result,
				}
			})
		)
	const PlainFetch = Command.define(`Fetch${config.name}`, {
		args: FetchArgs,
		messages: [Message.SettledFetch],
		execute: executeFetch,
	})
	const InterruptibleFetch = Command.define(`Fetch${config.name}`, {
		args: FetchArgs,
		messages: [Message.SettledFetch, Message.CompletedCancelFetch],
		interrupt: {
			keyFields: ["instanceId", "queryArgs", "requestId"],
			toKey: (keyArgs: { readonly instanceId: string; readonly requestId: number; readonly queryArgs: Args }) =>
				encodeInterruptKey([keyArgs.instanceId, toKey(keyArgs.queryArgs), keyArgs.requestId]),
		},
		execute: executeFetch,
	})
	const Fetch = config.interrupt === true ? InterruptibleFetch : PlainFetch

	const Model = makeKeyedQueryModel(config.data, config.error, Args)
	type Model = typeof Model.Type
	type UpdateReturn = Update.Return<Model, Message, R>
	type UpdateStep = Update.Step<Model, Message, R>

	const store: CacheStore<Model, Args, A, E, Message, R> = {
		read: (model, args) =>
			AsyncData.fromOptionOrIdle(Option.map(HashMap.get(model.slots, toKey(args)), (slot) => slot.data)),
		begin(model, args, data) {
			const allocated = allocateRequestId(model.nextRequestId)
			return {
				model: modifyFields(model, {
					nextRequestId: () => allocated.nextRequestId,
					slots: HashMap.set(toKey(args), {
						args,
						data,
						maybePendingRequestId: Option.some(allocated.requestId),
					}),
				}),
				request: {
					instanceId: model.instanceId,
					requestId: allocated.requestId,
				},
			}
		},
		isCurrent: (model, args, request) =>
			Option.match(HashMap.get(model.slots, toKey(args)), {
				onNone: () => false,
				onSome: (slot) => sameRequest(model.instanceId, slot.maybePendingRequestId, request),
			}),
		settle: (model, args, data) =>
			modifyFields(model, {
				nextRequestId: Number.increment,
				slots: HashMap.set(toKey(args), { args, data, maybePendingRequestId: Option.none() }),
			}),
		load: (args, request) => Fetch({ ...request, queryArgs: args }),
		interrupt:
			config.interrupt === true
				? (model, args, intent) =>
						Option.flatMap(HashMap.get(model.slots, toKey(args)), (slot) =>
							Option.map(slot.maybePendingRequestId, (requestId) =>
								InterruptibleFetch.Interrupt(
									{ instanceId: model.instanceId, queryArgs: args, requestId },
									(outcome) => ({
										_tag: "CompletedCancelFetch",
										args,
										instanceId: model.instanceId,
										requestId,
										outcome,
										intent,
									})
								)
							)
						)
				: undefined,
	}

	const hasSlot = (model: Model, args: Args): boolean => HashMap.has(model.slots, toKey(args))

	function forgetSlot(model: Model, args: Args): UpdateReturn {
		if (!hasSlot(model, args)) return { model }

		const forgotten = modifyFields(model, {
			slots: HashMap.remove(toKey(args)),
		})
		if (AsyncData.isPending(store.read(model, args)) && store.interrupt !== undefined) {
			const maybeInterrupt = store.interrupt(model, args, CancelIntent.Forget())
			if (Option.isSome(maybeInterrupt)) {
				return { model: forgotten, commands: [maybeInterrupt.value] }
			}
		}

		return { model: forgotten }
	}

	const toLiveSlots = (liveArgs: ReadonlyArray<Args>) =>
		HashMap.fromIterable(Array.map(liveArgs, (args): readonly [string, Args] => [toKey(args), args]))

	function watchSlots(model: Model, liveSlots: HashMap.HashMap<string, Args>): UpdateReturn {
		const liveKeys = HashSet.fromIterable(HashMap.keys(liveSlots))
		const forgetExtras = HashMap.reduce(model.slots, Array.empty<UpdateStep>(), function (steps, slot, key) {
			if (HashSet.has(liveKeys, key)) return steps

			return Array.append(steps, (current: Model) => forgetSlot(current, slot.args))
		})
		const loadLive = Array.map(
			HashMap.toValues(liveSlots),
			(args): UpdateStep =>
				(current) =>
					applyPolicy(store, current, args, "loadIfMissing")
		)
		return Update.combine(model, Array.appendAll(forgetExtras, loadLive))
	}

	const policy = (name: Policy): Update.Fold<Model, Message, Args, R> =>
		Function.dual(2, (model: Model, args: Args): UpdateReturn => applyPolicy(store, model, args, name))

	const settle: KeyedSettle<Model, Message, Args, A, E> = Function.dual(
		3,
		(model: Model, args: Args, data: AsyncData.AsyncData<A, E>): Update.Return<Model, Message> =>
			settleSlot(store, model, args, data)
	)

	const revalidate = policy("revalidate")
	const revalidateOrLoad = policy("revalidateOrLoad")
	const loadIfMissing = policy("loadIfMissing")
	const replace: Update.Fold<Model, Message, Args, R> = Function.dual(2, (model: Model, args: Args): UpdateReturn =>
		replaceSlot(store, model, args)
	)
	const forget: Update.Fold<Model, Message, Args, R> = Function.dual(2, (model: Model, args: Args): UpdateReturn =>
		forgetSlot(model, args)
	)
	const watch: Update.Fold<Model, Message, ReadonlyArray<Args>, R> = Function.dual(
		2,
		(model: Model, liveArgs: ReadonlyArray<Args>): UpdateReturn => watchSlots(model, toLiveSlots(liveArgs))
	)

	const update = (model: Model, message: Message): UpdateReturn =>
		Message.match<UpdateReturn>(message, {
			UpdatedWatch: ({ live }) => watchSlots(model, live),
			SettledFetch({ args, instanceId, requestId, result }) {
				if (!store.isCurrent(model, args, { instanceId, requestId })) {
					return { model }
				}

				const key = toKey(args)
				return Option.match(HashMap.get(model.slots, key), {
					onNone: () => ({
						model,
					}),
					onSome: (slot) => ({
						model: modifyFields(model, {
							slots: HashMap.set(
								key,
								modifyFields(slot, {
									data: (data) => AsyncData.settle(data, result),
									maybePendingRequestId: () => Option.none(),
								})
							),
						}),
					}),
				})
			},
			CompletedCancelFetch({ args, instanceId, requestId, outcome, intent }) {
				if (!store.isCurrent(model, args, { instanceId, requestId })) {
					return { model }
				}

				return completeCancel(store, model, args, outcome, intent)
			},
		})

	const toWatchMessage = (liveArgs: ReadonlyArray<Args>): Message => ({
		_tag: "UpdatedWatch",
		live: toLiveSlots(liveArgs),
	})

	const init = (instanceId: string): Model => ({
		instanceId,
		nextRequestId: 0,
		slots: HashMap.empty(),
	})
	const read = (model: Model, args: Args): SlotState => store.read(model, args)
	const settleIf: KeyedSettleIf<Model, Message, Args, A, E> = Function.dual(
		4,
		function (
			model: Model,
			args: Args,
			result: AsyncData.AsyncData<A, E>,
			options: SettleIfOptions<A, E>
		): Update.Return<Model, Message> {
			if (!shouldSettle(read(model, args), result, options)) return { model }
			return settle(model, args, result)
		}
	)
	const settleIfLoad: KeyedSettleIfLoad<Model, Message, Args, A, E> = Function.dual(
		3,
		function (
			model: Model,
			load: KeyedLoadPayload<Args, A, E>,
			options: SettleIfOptions<A, E>
		): Update.Return<Model, Message> {
			const args = loadArgsFromPayload(load)
			return settleIf(model, args, load.result, options)
		}
	)

	function liftSettle<ParentModel, ParentMessage>(
		lens: FoldLens<ParentModel, ParentMessage, Model, Message>
	): KeyedSettle<ParentModel, ParentMessage, Args, A, E> {
		const fold = Update.foldChild({
			...lens,
			update: (model: Model, input: { readonly args: Args; readonly result: AsyncData.AsyncData<A, E> }) =>
				settle(model, input.args, input.result),
		})
		return Function.dual(3, (model: ParentModel, args: Args, result: AsyncData.AsyncData<A, E>) =>
			fold(model, { args, result })
		)
	}

	function liftSettleIf<ParentModel, ParentMessage>(
		lens: FoldLens<ParentModel, ParentMessage, Model, Message>
	): KeyedSettleIf<ParentModel, ParentMessage, Args, A, E> {
		const fold = Update.foldChild({
			...lens,
			update: function (
				model: Model,
				input: {
					readonly args: Args
					readonly result: AsyncData.AsyncData<A, E>
					readonly options: SettleIfOptions<A, E>
				}
			) {
				return settleIf(model, input.args, input.result, input.options)
			},
		})
		return Function.dual(
			4,
			function (
				model: ParentModel,
				args: Args,
				result: AsyncData.AsyncData<A, E>,
				options: SettleIfOptions<A, E>
			) {
				return fold(model, { args, result, options })
			}
		)
	}

	function liftSettleIfLoad<ParentModel, ParentMessage>(
		lens: FoldLens<ParentModel, ParentMessage, Model, Message>
	): KeyedSettleIfLoad<ParentModel, ParentMessage, Args, A, E> {
		const fold = Update.foldChild({
			...lens,
			update: function (
				model: Model,
				input: {
					readonly load: KeyedLoadPayload<Args, A, E>
					readonly options: SettleIfOptions<A, E>
				}
			) {
				const args = loadArgsFromPayload(input.load)
				return settleIf(model, args, input.load.result, input.options)
			},
		})
		return Function.dual(3, function (model: ParentModel, load: KeyedLoadPayload<Args, A, E>, options: SettleIfOptions<A, E>) {
			return fold(model, { load, options })
		})
	}

	const liftFromLens = <ParentModel, ParentMessage>(
		foldConfig: FoldLens<ParentModel, ParentMessage, Model, Message>
	) => ({
		fold: Update.foldChild({ update, ...foldConfig }),
		settle: liftSettle(foldConfig),
		settleIf: liftSettleIf(foldConfig),
		settleIfLoad: liftSettleIfLoad(foldConfig),
		revalidate: foldChildFromPolicy(revalidate, foldConfig),
		revalidateOrLoad: foldChildFromPolicy(revalidateOrLoad, foldConfig),
		loadIfMissing: foldChildFromPolicy(loadIfMissing, foldConfig),
		replace: foldChildFromPolicy(replace, foldConfig),
		watch: foldChildFromPolicy(watch, foldConfig),
		forget: foldChildFromPolicy(forget, foldConfig),
		watchSubscription: (
			entry: Subscription.EntryBuilder<ParentModel, ParentMessage, R>,
			modelToArgs: (model: ParentModel) => ReadonlyArray<Args>
		) => watchKeyedQuerySubscription(entry, foldConfig.toParentMessage, modelToArgs),
	})

	function lift<ParentModel, ParentMessage>(
		config: ParentKeyFoldConfig<ParentModel, ParentMessage, Model, Message>
	): Lifted.KeyedQuery<ParentModel, ParentMessage, Message, Args, R, A, E>
	function lift<ParentModel, ParentMessage>(
		config: FoldLens<ParentModel, ParentMessage, Model, Message>
	): Lifted.KeyedQuery<ParentModel, ParentMessage, Message, Args, R, A, E>
	function lift<ParentModel, ParentMessage>(config: LiftConfig<ParentModel, ParentMessage, Model, Message>) {
		if (isParentKeyFoldConfig(config)) {
			return liftFromLens(parentKeyToLens(config))
		}

		return liftFromLens(config)
	}

	const watchKeyedQuerySubscription = <ParentModel, ParentMessage>(
		entry: Subscription.EntryBuilder<ParentModel, ParentMessage, R>,
		toParentMessage: (message: Message) => ParentMessage,
		modelToArgs: (model: ParentModel) => ReadonlyArray<Args>
	) =>
		entry(
			{ args: Schema.Array(Args) },
			{
				modelToDependencies: (parent: ParentModel) => ({
					args: Array.sortWith(
						HashMap.toValues(toLiveSlots(modelToArgs(parent))),
						(liveArgs) => toKey(liveArgs),
						Order.String
					),
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
	) => watchKeyedQuerySubscription(entry, watchConfig.toParentMessage, watchConfig.modelToArgs)

	const run = (args: Args): Effect.Effect<SlotState, never, R> => runExecute(config.execute(args))

	return {
		name: config.name,
		Args,
		toKey,
		Model,
		Message,
		Fetch,
		init,
		read,
		update,
		settle,
		settleIf,
		settleIfLoad,
		revalidate,
		revalidateOrLoad,
		loadIfMissing,
		replace,
		watch,
		forget,
		lift,
		watchSubscription,
		run,
	}
}
