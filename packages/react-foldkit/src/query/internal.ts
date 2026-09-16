import { Effect, Match, Option, Predicate, Schema, pipe } from "effect"
import * as AsyncData from "../asyncData"
import * as Command from "../command"
import { defineMessageUnion } from "../message"
import { makeConstrainedEvo } from "../struct"
import * as Subscription from "../subscription"
import * as Update from "../update"

export type Policy = "loadIfMissing" | "revalidate" | "revalidateOrLoad"

export type FoldLens<ParentModel, ParentMessage, ChildModel, ChildMessage> = Pick<
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

export type Lift<ParentModel, ParentMessage, ChildMessage, R> = {
	(model: ParentModel, fields: ParentMessageValue<ChildMessage>): Update.Return<ParentModel, ParentMessage, R>
	(model: ParentModel): (fields: ParentMessageValue<ChildMessage>) => Update.Return<ParentModel, ParentMessage, R>
}

export type FieldFoldConfig<ParentModel, ParentMessage, ChildModel, ChildMessage> = Readonly<{
	field: ChildField<ParentModel, ChildModel>
	toParentMessage: GotWrapper<ChildMessage, ParentMessage>
}>

type MissingParentModelFieldConfig = {
	readonly field: never
	readonly toParentMessage: never
}

export type LiftConfig<ParentModel, ParentMessage, ChildModel, ChildMessage> =
	| FoldLens<ParentModel, ParentMessage, ChildModel, ChildMessage>
	| FieldFoldConfig<ParentModel, ParentMessage, ChildModel, ChildMessage>

export type LiftField<ChildModel, ChildMessage, R> = {
	<ParentModel, ParentMessage>(
		config: FoldLens<ParentModel, ParentMessage, ChildModel, ChildMessage>
	): Lifted.Field<ParentModel, ParentMessage, ChildMessage, R>
	<ParentModel = never, ParentMessage = never>(): [ParentMessage] extends [never]
		? <InferredParentMessage>(
				config: [ParentModel] extends [never]
					? MissingParentModelFieldConfig
					: FieldFoldConfig<ParentModel, InferredParentMessage, ChildModel, ChildMessage>
			) => Lifted.Field<ParentModel, InferredParentMessage, ChildMessage, R>
		: (
				config: [ParentModel] extends [never]
					? MissingParentModelFieldConfig
					: FieldFoldConfig<ParentModel, ParentMessage, ChildModel, ChildMessage>
			) => Lifted.Field<ParentModel, ParentMessage, ChildMessage, R>
}

export type LiftKeyed<ChildModel, ChildMessage, Args, R> = {
	<ParentModel, ParentMessage>(
		config: FoldLens<ParentModel, ParentMessage, ChildModel, ChildMessage>
	): Lifted.Keyed<ParentModel, ParentMessage, ChildMessage, Args, R>
	<ParentModel = never, ParentMessage = never>(): [ParentMessage] extends [never]
		? <InferredParentMessage>(
				config: [ParentModel] extends [never]
					? MissingParentModelFieldConfig
					: FieldFoldConfig<ParentModel, InferredParentMessage, ChildModel, ChildMessage>
			) => Lifted.Keyed<ParentModel, InferredParentMessage, ChildMessage, Args, R>
		: (
				config: [ParentModel] extends [never]
					? MissingParentModelFieldConfig
					: FieldFoldConfig<ParentModel, ParentMessage, ChildModel, ChildMessage>
			) => Lifted.Keyed<ParentModel, ParentMessage, ChildMessage, Args, R>
}

const isFieldFoldConfig = <ParentModel, ParentMessage, ChildModel, ChildMessage>(
	config: LiftConfig<ParentModel, ParentMessage, ChildModel, ChildMessage>
): config is Extract<LiftConfig<ParentModel, ParentMessage, ChildModel, ChildMessage>, { readonly field: string }> =>
	Predicate.hasProperty(config, "field")

export function resolveFoldLens<ParentModel, ParentMessage, ChildModel, ChildMessage>(
	config: LiftConfig<ParentModel, ParentMessage, ChildModel, ChildMessage>
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
		toParentMessage: (childMessage: ChildMessage) => config.toParentMessage({ message: childMessage }),
	}
}

export const attachFold = <FoldFn extends object, Policies extends object>(
	fold: FoldFn,
	policies: Policies
): FoldFn & Policies => Object.assign(fold, policies)

export function asLift<ParentModel, ParentMessage, ChildMessage, R>(
	fold: Update.Fold<ParentModel, ParentMessage, ChildMessage, R>
): Lift<ParentModel, ParentMessage, ChildMessage, R> {
	function foldCall(
		model: ParentModel,
		fields: ParentMessageValue<ChildMessage>
	): Update.Return<ParentModel, ParentMessage, R>
	function foldCall(
		model: ParentModel
	): (fields: ParentMessageValue<ChildMessage>) => Update.Return<ParentModel, ParentMessage, R>
	function foldCall(model: ParentModel, fields?: ParentMessageValue<ChildMessage>) {
		if (fields !== undefined) return fold(model, fields.message)

		return (nextFields: ParentMessageValue<ChildMessage>) => fold(model, nextFields.message)
	}

	return foldCall
}

export const foldChildFromInform = <ParentModel, ParentMessage, ChildModel, ChildMessage, Input, R>(
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
export const FetchInterruptOutcome = defineMessageUnion({
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

export type CacheStore<Model, Args, A, E, Message, R> = Readonly<{
	read: (model: Model, args: Args) => AsyncData.AsyncData<A, E>
	write: (model: Model, args: Args, data: AsyncData.AsyncData<A, E>) => Model
	load: (args: Args) => Command.Command<Message, never, R>
	interrupt: (args: Args) => Command.Command<Message, never, R>
}>

export const applyPolicy = <Model, Args, A, E, Message, R>(
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

export function replaceSlot<Model, Args, A, E, Message, R>(
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

export const completeCancel = <Model, Args, A, E, Message, R>(
	store: CacheStore<Model, Args, A, E, Message, R>,
	model: Model,
	args: Args,
	outcome: Command.Interruptible.Outcome
): Update.Return<Model, Message, R> =>
	Command.Interruptible.Outcome.match<Update.Return<Model, Message, R>>(outcome, {
		Interrupted: () => ({ model, commands: [store.load(args)] }),
		NotFound: () => {
			if (AsyncData.isPending(store.read(model, args))) {
				return { model, commands: [store.load(args)] }
			}

			return applyPolicy(store, model, args, "revalidateOrLoad")
		},
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

export type KeyedInterruptArgs<Fields extends Schema.Struct.Fields> = Pick<
	KeyedArgs<Fields>,
	keyof KeyedArgs<Fields> & string
>

export namespace Lifted {
	export type Field<ParentModel, ParentMessage, ChildMessage, R = never> = Lift<
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

	export type Keyed<ParentModel, ParentMessage, ChildMessage, Args, R = never> = Lift<
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
