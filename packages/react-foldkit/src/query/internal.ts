import { Effect, Match, Option, Predicate, Record as EffectRecord, Result, Schema, pipe } from "effect"

import * as AsyncData from "foldkit/asyncData"
import type * as Command from "foldkit/command"
import { Interruptible } from "foldkit/command"
import { defineMessageUnion } from "../message"
import { defineTaggedUnion } from "foldkit/schema"
import { makeModifyFieldsFor } from "foldkit/struct"
import * as Subscription from "../subscription"
import * as Update from "../update"

export type Policy = "loadIfMissing" | "revalidate" | "revalidateOrLoad"

export type FoldLens<ParentModel, ParentMessage, ChildModel, ChildMessage> = Pick<
	Update.ChildFold<ParentModel, ParentMessage, ChildModel, never, ChildMessage>,
	"read" | "write" | "toParentMessage"
>

export type FieldOf<ParentModel, ChildModel> = Extract<
	{
		[K in keyof ParentModel]-?: ParentModel[K] extends ChildModel ? K : never
	}[keyof ParentModel],
	string
>

export type ParentKeyFoldConfig<ParentModel, ParentMessage, ChildModel, ChildMessage> = Readonly<{
	field: FieldOf<ParentModel, ChildModel>
	toParentMessage: (message: ChildMessage) => ParentMessage
}>

export type LiftConfig<ParentModel, ParentMessage, ChildModel, ChildMessage> =
	| ParentKeyFoldConfig<ParentModel, ParentMessage, ChildModel, ChildMessage>
	| FoldLens<ParentModel, ParentMessage, ChildModel, ChildMessage>

export type LiftQuery<ChildModel, ChildMessage, R, A, E> = {
	<ParentModel, ParentMessage>(
		config: ParentKeyFoldConfig<ParentModel, ParentMessage, ChildModel, ChildMessage>
	): Lifted.Query<ParentModel, ParentMessage, ChildMessage, R, A, E>
	<ParentModel, ParentMessage>(
		config: FoldLens<ParentModel, ParentMessage, ChildModel, ChildMessage>
	): Lifted.Query<ParentModel, ParentMessage, ChildMessage, R, A, E>
}

export type LiftKeyedQuery<ChildModel, ChildMessage, Args, R, A, E> = {
	<ParentModel, ParentMessage>(
		config: ParentKeyFoldConfig<ParentModel, ParentMessage, ChildModel, ChildMessage>
	): Lifted.KeyedQuery<ParentModel, ParentMessage, ChildMessage, Args, R, A, E>
	<ParentModel, ParentMessage>(
		config: FoldLens<ParentModel, ParentMessage, ChildModel, ChildMessage>
	): Lifted.KeyedQuery<ParentModel, ParentMessage, ChildMessage, Args, R, A, E>
}

export const isParentKeyFoldConfig = <ParentModel, ParentMessage, ChildModel, ChildMessage>(
	config: LiftConfig<ParentModel, ParentMessage, ChildModel, ChildMessage>
): config is Extract<LiftConfig<ParentModel, ParentMessage, ChildModel, ChildMessage>, { readonly field: string }> =>
	Predicate.hasProperty(config, "field")

export function parentKeyToLens<
	ParentModel extends Record<FieldOf<ParentModel, ChildModel>, ChildModel>,
	ParentMessage,
	ChildModel,
	ChildMessage,
>(
	config: ParentKeyFoldConfig<ParentModel, ParentMessage, ChildModel, ChildMessage>
): FoldLens<ParentModel, ParentMessage, ChildModel, ChildMessage> {
	const modifyParentFields = makeModifyFieldsFor<Record<FieldOf<ParentModel, ChildModel>, ChildModel>>()
	return {
		read: function (model: ParentModel) {
			return Option.some(model[config.field])
		},
		write: function (model: ParentModel, nextChild: ChildModel) {
			return modifyParentFields(
				model,
				EffectRecord.singleton(config.field, () => nextChild)
			)
		},
		toParentMessage: config.toParentMessage,
	}
}

export const foldChildFromPolicy = <ParentModel, ParentMessage, ChildModel, ChildMessage, Input, R>(
	policy: Update.Fold<ChildModel, ChildMessage, Input, R>,
	lens: FoldLens<ParentModel, ParentMessage, ChildModel, ChildMessage>
): Update.Fold<ParentModel, ParentMessage, Input, R> =>
	Update.foldChild({
		update: (childModel: ChildModel, input: Input) => policy(childModel, input),
		...lens,
	})

export const FetchInterruptOutcome = defineMessageUnion({
	Interrupted: {},
	NotFound: {},
})

/** Reason for cancelling a pending Query Fetch. */
export const CancelIntent = defineTaggedUnion({
	Replace: {},
	Forget: {},
	Settle: {},
})

/** Reason carried by a completed Query Fetch cancellation. */
export type CancelIntent = typeof CancelIntent.Type

type Transition = <A, E>(data: AsyncData.AsyncData<A, E>) => Option.Option<AsyncData.AsyncData<A, E>>

const transitionFor = (policy: Policy): Transition =>
	Match.value(policy).pipe(
		Match.when("loadIfMissing", () => AsyncData.loadIfMissing),
		Match.when("revalidate", () => AsyncData.revalidate),
		Match.when("revalidateOrLoad", () => AsyncData.revalidateOrLoad),
		Match.exhaustive
	)

export const allocateRequestId = (
	nextRequestId: number
): Readonly<{
	requestId: number
	nextRequestId: number
}> => ({
	requestId: nextRequestId,
	nextRequestId: nextRequestId + 1,
})

export type RequestIdentity = Readonly<{
	instanceId: string
	requestId: number
}>

export const sameRequest = (
	instanceId: string,
	maybePendingRequestId: Option.Option<number>,
	request: RequestIdentity
): boolean =>
	instanceId === request.instanceId &&
	Option.match(maybePendingRequestId, {
		onNone: () => false,
		onSome: (pendingRequestId) => pendingRequestId === request.requestId,
	})

export type CacheStore<Model, Args, A, E, Message, R> = Readonly<{
	read: (model: Model, args: Args) => AsyncData.AsyncData<A, E>
	begin: (
		model: Model,
		args: Args,
		data: AsyncData.AsyncData<A, E>
	) => Readonly<{ model: Model; request: RequestIdentity }>
	isCurrent: (model: Model, args: Args, request: RequestIdentity) => boolean
	settle: (model: Model, args: Args, data: AsyncData.AsyncData<A, E>) => Model
	load: (args: Args, request: RequestIdentity) => Command.Command<Message, never, R>
	interrupt:
		((model: Model, args: Args, intent: CancelIntent) => Option.Option<Command.Command<Message, never>>) | undefined
}>

/** Installs an external outcome without fetching; all other AsyncData states are inert. */
export function settleSlot<Model, Args, A, E, Message, R>(
	store: CacheStore<Model, Args, A, E, Message, R>,
	model: Model,
	args: Args,
	data: AsyncData.AsyncData<A, E>
): Update.Return<Model, Message> {
	const settle = (result: Result.Result<A, E>): Update.Return<Model, Message> => {
		const settled = store.settle(model, args, AsyncData.settle(store.read(model, args), result))
		return Option.match(store.interrupt?.(model, args, CancelIntent.Settle()) ?? Option.none(), {
			onNone: () => ({ model: settled }),
			onSome: (command) => ({ model: settled, commands: [command] }),
		})
	}
	return Match.value(data).pipe(
		Match.tag("Success", ({ data }) => settle(Result.succeed(data))),
		Match.tag("Failure", ({ error }) => settle(Result.fail(error))),
		Match.orElse(() => ({ model }))
	)
}

/** A keyed settlement can also be used as a data-last Update step. */
export interface KeyedSettle<Model, Message, Args, A, E> {
	(model: Model, args: Args, result: AsyncData.AsyncData<A, E>): Update.Return<Model, Message>
	(args: Args, result: AsyncData.AsyncData<A, E>): Update.Step<Model, Message>
}

export const applyPolicy = <Model, Args, A, E, Message, R>(
	store: CacheStore<Model, Args, A, E, Message, R>,
	model: Model,
	args: Args,
	policy: Policy
): Update.Return<Model, Message, R> =>
	Option.match(transitionFor(policy)(store.read(model, args)), {
		onNone: () => ({ model }),
		onSome(nextData) {
			const begun = store.begin(model, args, nextData)
			return {
				model: begun.model,
				commands: [store.load(args, begun.request)],
			}
		},
	})

export function replaceSlot<Model, Args, A, E, Message, R>(
	store: CacheStore<Model, Args, A, E, Message, R>,
	model: Model,
	args: Args
): Update.Return<Model, Message, R> {
	if (!AsyncData.isPending(store.read(model, args))) {
		return applyPolicy(store, model, args, "revalidateOrLoad")
	}

	if (store.interrupt !== undefined) {
		const maybeInterrupt = store.interrupt(model, args, CancelIntent.Replace())
		if (Option.isSome(maybeInterrupt)) {
			return { model, commands: [maybeInterrupt.value] }
		}
	}

	const begun = store.begin(model, args, store.read(model, args))
	return {
		model: begun.model,
		commands: [store.load(args, begun.request)],
	}
}

export const completeCancel = <Model, Args, A, E, Message, R>(
	store: CacheStore<Model, Args, A, E, Message, R>,
	model: Model,
	args: Args,
	outcome: Interruptible.Outcome,
	intent: CancelIntent
): Update.Return<Model, Message, R> =>
	Interruptible.Outcome.match<Update.Return<Model, Message, R>>(outcome, {
		Interrupted: () =>
			CancelIntent.match<Update.Return<Model, Message, R>>(intent, {
				Replace() {
					const begun = store.begin(model, args, store.read(model, args))
					return {
						model: begun.model,
						commands: [store.load(args, begun.request)],
					}
				},
				Forget: () => ({ model }),
				Settle: () => ({ model }),
			}),
		NotFound: () => ({ model }),
	})

export const runExecute = <A, E, R>(
	execute: Effect.Effect<A, E, R>
): Effect.Effect<AsyncData.AsyncData<A, E>, never, R> =>
	pipe(
		execute,
		Effect.result,
		Effect.map((result) => AsyncData.settle(AsyncData.Loading(), result))
	)

export type SettledFetchOf<Message extends Schema.Top> = Extract<Message["Type"], { readonly _tag: "SettledFetch" }>

export type KeyedArgs<Fields extends Schema.Struct.Fields> = Schema.Schema.Type<Schema.Struct<Fields>>

type FetchResult<Message> = Message extends {
	readonly _tag: "SettledFetch"
	readonly result: infer Outcome extends Result.Result<unknown, unknown>
}
	? Outcome
	: never

/** Policy for installing an external Success/Failure before settle. */
export interface SettleIfOptions<A, E> {
	readonly fresher: (incoming: A, current: A) => boolean
	readonly acceptFailure?: (current: AsyncData.AsyncData<A, E>) => boolean
}

/** True when a Failure may replace an empty, non-pending slot. */
export function acceptEmptyFailure<A, E>(current: AsyncData.AsyncData<A, E>): boolean {
	return !AsyncData.hasData(current) && !AsyncData.isPending(current)
}

/** Whether an external AsyncData outcome should be settled into the current slot. */
export function shouldSettle<A, E>(
	current: AsyncData.AsyncData<A, E>,
	result: AsyncData.AsyncData<A, E>,
	options: SettleIfOptions<A, E>
): boolean {
	if (AsyncData.isFailure(result)) {
		return (options.acceptFailure ?? acceptEmptyFailure)(current)
	}
	if (!AsyncData.isSuccess(result)) return false
	return Option.match(AsyncData.getData(current), {
		onNone: function () {
			return true
		},
		onSome: function (currentData) {
			return options.fresher(result.data, currentData)
		},
	})
}

/** A keyed settleIf can also be used as a data-last Update step. */
export interface KeyedSettleIf<Model, Message, Args, A, E> {
	(
		model: Model,
		args: Args,
		result: AsyncData.AsyncData<A, E>,
		options: SettleIfOptions<A, E>
	): Update.Return<Model, Message>
	(
		args: Args,
		result: AsyncData.AsyncData<A, E>,
		options: SettleIfOptions<A, E>
	): Update.Step<Model, Message>
}

export type LoadPayload<Args, A, E> = Args & {
	readonly result: AsyncData.AsyncData<A, E>
}

export interface SettleIfLoad<Model, Message, Args, A, E> {
	(
		model: Model,
		load: LoadPayload<Args, A, E>,
		options: SettleIfOptions<A, E>
	): Update.Return<Model, Message>
	(load: LoadPayload<Args, A, E>, options: SettleIfOptions<A, E>): Update.Step<Model, Message>
}

export function loadArgsFromPayload<Args extends Record<string, unknown>, A, E>(
	load: LoadPayload<Args, A, E>
): Args {
	const { result: _result, ...args } = load
	return args as unknown as Args
}

export namespace Lifted {
	export type Query<
		ParentModel,
		ParentMessage,
		ChildMessage,
		R = never,
		A = Result.Result.Success<FetchResult<ChildMessage>>,
		E = Result.Result.Failure<FetchResult<ChildMessage>>,
	> = Readonly<{
		fold: Update.Fold<ParentModel, ParentMessage, ChildMessage, R>
		settle: Update.Fold<ParentModel, ParentMessage, AsyncData.AsyncData<A, E>>
		settleIf: {
			(
				model: ParentModel,
				result: AsyncData.AsyncData<A, E>,
				options: SettleIfOptions<A, E>
			): Update.Return<ParentModel, ParentMessage>
			(
				result: AsyncData.AsyncData<A, E>,
				options: SettleIfOptions<A, E>
			): Update.Step<ParentModel, ParentMessage>
		}
		settleIfLoad: SettleIfLoad<ParentModel, ParentMessage, {}, A, E>
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

	export type KeyedQuery<
		ParentModel,
		ParentMessage,
		ChildMessage,
		Args,
		R = never,
		A = Result.Result.Success<FetchResult<ChildMessage>>,
		E = Result.Result.Failure<FetchResult<ChildMessage>>,
	> = Readonly<{
		fold: Update.Fold<ParentModel, ParentMessage, ChildMessage, R>
		settle: KeyedSettle<ParentModel, ParentMessage, Args, A, E>
		settleIf: KeyedSettleIf<ParentModel, ParentMessage, Args, A, E>
		settleIfLoad: SettleIfLoad<ParentModel, ParentMessage, Args, A, E>
		revalidate: Update.Fold<ParentModel, ParentMessage, Args, R>
		revalidateOrLoad: Update.Fold<ParentModel, ParentMessage, Args, R>
		loadIfMissing: Update.Fold<ParentModel, ParentMessage, Args, R>
		replace: Update.Fold<ParentModel, ParentMessage, Args, R>
		watch: Update.Fold<ParentModel, ParentMessage, ReadonlyArray<Args>, R>
		forget: Update.Fold<ParentModel, ParentMessage, Args, R>
		watchSubscription: (
			entry: Subscription.EntryBuilder<ParentModel, ParentMessage, R>,
			modelToArgs: (model: ParentModel) => ReadonlyArray<Args>
		) => Subscription.EntryWithoutKeepAlive<ParentModel, ParentMessage, { readonly args: ReadonlyArray<Args> }, R>
	}>
}
