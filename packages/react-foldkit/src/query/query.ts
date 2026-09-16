import { Effect, pipe, Schema, Stream } from "effect"
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
	type FoldLens,
	type LiftConfig,
	type LiftQuery,
	type ParentKeyFoldConfig,
	type ParentMessage,
	replaceSlot,
	resolveFoldLens,
	runExecute,
	type SettledFetchOf,
} from "./internal"

export type QueryConfig<Name extends string, A, AI, E, EI, R> = Readonly<{
	name: Name
	data: Schema.Codec<A, AI>
	error: Schema.Codec<E, EI>
	execute: Effect.Effect<A, E, R>
}>

/** Single-slot remote-data Submodel. `Model` is the `AsyncData` codec. */
export interface Query<Name extends string, Model extends Schema.Top, Message extends Schema.Top, R = never> {
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
	readonly lift: LiftQuery<Model["Type"], Message["Type"], R>
	readonly watchSubscription: <ParentModel, ParentMessage>(
		entry: Subscription.EntryBuilder<ParentModel, ParentMessage, R>,
		config: {
			readonly toParentMessage: (message: Message["Type"]) => ParentMessage
			readonly modelToIsWatching: (model: ParentModel) => boolean
		}
	) => Subscription.EntryWithoutKeepAlive<ParentModel, ParentMessage, { readonly isWatching: boolean }, R>
	readonly run: Effect.Effect<Model["Type"], never, R>
}

export namespace Query {
	export type Any = Pick<Query<string, Schema.Top, Schema.Top>, "Model" | "Message" | "init">
}

export function defineQuery<Name extends string, A, AI, E, EI, R>(config: QueryConfig<Name, A, AI, E, EI, R>) {
	const states = AsyncData.Schema(config.data, config.error)

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
			SettledFetch({ result }) {
				if (!hasSlot(model)) return { model }

				return {
					model: store.write(model, undefined, AsyncData.settle(store.read(model, undefined), result)),
				}
			},
			CompletedCancelFetch({ outcome }) {
				if (!hasSlot(model)) return { model }

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

	const watchQuerySubscription = <ParentModel, ParentMessage>(
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

	const liftFromLens = <ParentModel, ParentMessage>(
		foldConfig: FoldLens<ParentModel, ParentMessage, Model, Message>
	) =>
		attachFold(asLift(Update.foldChild({ update, ...foldConfig })), {
			revalidate: Update.foldChildStep({ update: informRevalidate, ...foldConfig }),
			revalidateOrLoad: Update.foldChildStep({ update: informRevalidateOrLoad, ...foldConfig }),
			loadIfMissing: Update.foldChildStep({ update: informLoadIfMissing, ...foldConfig }),
			replace: Update.foldChildStep({ update: informReplace, ...foldConfig }),
			watch: Update.foldChildStep({ update: informWatch, ...foldConfig }),
			forget: Update.foldChildStep({ update: informForget, ...foldConfig }),
			watchSubscription: (
				entry: Subscription.EntryBuilder<ParentModel, ParentMessage, R>,
				modelToIsWatching: (model: ParentModel) => boolean
			) => watchQuerySubscription(entry, foldConfig.toParentMessage, modelToIsWatching),
		})

	const lift = function <ParentModel, ParentMessage>(
		config?: LiftConfig<ParentModel, ParentMessage, Model, Message>
	) {
		if (arguments.length === 0)
			return (parentKeyConfig: ParentKeyFoldConfig<ParentModel, ParentMessage, Model, Message>) =>
				liftFromLens(resolveFoldLens(parentKeyConfig))

		return liftFromLens(resolveFoldLens(config as LiftConfig<ParentModel, ParentMessage, Model, Message>))
	} as LiftQuery<Model, Message, R>

	const watchSubscription = <ParentModel, ParentMessage>(
		entry: Subscription.EntryBuilder<ParentModel, ParentMessage, R>,
		watchConfig: {
			readonly toParentMessage: (message: Message) => ParentMessage
			readonly modelToIsWatching: (model: ParentModel) => boolean
		}
	) => watchQuerySubscription(entry, watchConfig.toParentMessage, watchConfig.modelToIsWatching)

	const run = runExecute(config.execute)

	return {
		Model: states.schema,
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
		lift,
		watchSubscription,
		run,
	} satisfies Query<Name, typeof states.schema, typeof Message, R>
}
