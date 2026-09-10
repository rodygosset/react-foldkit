import { Array, Effect, Function, HashMap, Match, Option, Predicate, Schema, pipe } from "effect"
import * as AsyncData from "./asyncData"
import * as Command from "./command"
import { defineMessageUnion } from "./message"
import * as Update from "./update"

type Policy = "loadIfMissing" | "revalidate" | "revalidateOrLoad"

type BindConfig<ParentModel, ParentMessage, ChildModel, ChildMessage> = Readonly<{
	read: (model: ParentModel) => Option.Option<ChildModel>
	write: (model: ParentModel, nextChildModel: ChildModel) => ParentModel
	toParentMessage: (message: ChildMessage) => ParentMessage
}>

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

const replaceSlot = <Model, Args, A, E, Message, R>(
	store: CacheStore<Model, Args, A, E, Message, R>,
	model: Model,
	args: Args
): Update.Return<Model, Message, R> => {
	if (!AsyncData.isPending(store.read(model, args))) {
		return applyPolicy(store, model, args, "revalidateOrLoad")
	}
	return {
		model,
		commands: [store.interrupt(args)],
	}
}

const completeCancel = <Model, Args, A, E, Message, R>(
	store: CacheStore<Model, Args, A, E, Message, R>,
	model: Model,
	args: Args,
	outcome: typeof FetchInterruptOutcome.Type
): Update.Return<Model, Message, R> =>
	Match.value(outcome).pipe(
		Match.withReturnType<Update.Return<Model, Message, R>>(),
		Match.tag("Interrupted", () => ({ model, commands: [store.load(args)] })),
		Match.tag("NotFound", () => applyPolicy(store, model, args, "revalidateOrLoad")),
		Match.exhaustive
	)

const bindFold = <ParentModel, ParentMessage, ChildModel, ChildMessage, R>(
	update: (model: ChildModel, message: ChildMessage) => Update.Return<ChildModel, ChildMessage, R>,
	config: BindConfig<ParentModel, ParentMessage, ChildModel, ChildMessage>
) =>
	Update.foldChild({
		update,
		read: config.read,
		write: config.write,
		toParentMessage: config.toParentMessage,
	})

const bindFieldStep = <ParentModel, ParentMessage, ChildModel, ChildMessage, R>(
	update: (model: ChildModel) => Update.Return<ChildModel, ChildMessage, R>,
	config: BindConfig<ParentModel, ParentMessage, ChildModel, ChildMessage>
) =>
	Update.foldChildStep({
		update,
		read: config.read,
		write: config.write,
		toParentMessage: config.toParentMessage,
	})

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
	keyFields: Array.NonEmptyReadonlyArray<KeyField>
	toKey: (args: Pick<Schema.Schema.Type<Schema.Struct<Fields>>, KeyField>) => string
	execute: (args: Schema.Schema.Type<Schema.Struct<Fields>>) => Effect.Effect<A, E, R>
}>

const defineField = <Name extends string, A, AI, E, EI, R>(config: FieldConfig<Name, A, AI, E, EI, R>) => {
	const Data = AsyncData.Schema(config.data, config.error)

	const Message = defineMessageUnion({
		RequestedRevalidate: {},
		RequestedRevalidateOrLoad: {},
		RequestedLoadIfMissing: {},
		RequestedReplace: {},
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

	const update = (model: Model, message: Message): UpdateReturn =>
		Message.match<UpdateReturn>(message, {
			RequestedRevalidate: () => applyPolicy(store, model, undefined, "revalidate"),
			RequestedRevalidateOrLoad: () => applyPolicy(store, model, undefined, "revalidateOrLoad"),
			RequestedLoadIfMissing: () => applyPolicy(store, model, undefined, "loadIfMissing"),
			RequestedReplace: () => replaceSlot(store, model, undefined),
			SettledFetch: ({ result }) => ({
				model: store.write(model, undefined, AsyncData.settle(store.read(model, undefined), result)),
			}),
			CompletedCancelFetch: ({ outcome }) => completeCancel(store, model, undefined, outcome),
		})

	const informRevalidate = (model: Model): UpdateReturn => update(model, Message.RequestedRevalidate())
	const informRevalidateOrLoad = (model: Model): UpdateReturn => update(model, Message.RequestedRevalidateOrLoad())
	const informLoadIfMissing = (model: Model): UpdateReturn => update(model, Message.RequestedLoadIfMissing())
	const informReplace = (model: Model): UpdateReturn => update(model, Message.RequestedReplace())

	const init = (): Model => AsyncData.Idle()

	const bind = <ParentModel, ParentMessage>(bindConfig: BindConfig<ParentModel, ParentMessage, Model, Message>) => ({
		fold: bindFold(update, bindConfig),
		revalidate: bindFieldStep(informRevalidate, bindConfig),
		revalidateOrLoad: bindFieldStep(informRevalidateOrLoad, bindConfig),
		loadIfMissing: bindFieldStep(informLoadIfMissing, bindConfig),
		replace: bindFieldStep(informReplace, bindConfig),
	})

	return {
		Model: Data.schema,
		Message,
		Fetch,
		init,
		update,
		informRevalidate,
		informRevalidateOrLoad,
		informLoadIfMissing,
		informReplace,
		bind,
	}
}

const defineKeyed = <
	Name extends string,
	A,
	AI,
	E,
	EI,
	Fields extends Schema.Struct.Fields,
	KeyField extends keyof Schema.Schema.Type<Schema.Struct<Fields>> & string,
	R,
>(
	config: KeyedConfig<Name, A, AI, E, EI, Fields, KeyField, R>
) => {
	const Data = AsyncData.Schema(config.data, config.error)
	type Data = typeof Data.schema.Type
	const ArgsSchema = Schema.Struct(config.args)
	type Args = typeof ArgsSchema.Type

	const Message = defineMessageUnion({
		RequestedRevalidate: { args: ArgsSchema },
		RequestedRevalidateOrLoad: { args: ArgsSchema },
		RequestedLoadIfMissing: { args: ArgsSchema },
		RequestedReplace: { args: ArgsSchema },
		SettledFetch: { args: ArgsSchema, result: Schema.Result(config.data, config.error) },
		CompletedCancelFetch: {
			args: ArgsSchema,
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
			keyFields: config.keyFields,
			toKey: config.toKey,
		},
		execute: (args: Args) =>
			pipe(
				config.execute(args),
				Effect.result,
				Effect.map((result) => Message.SettledFetch({ args: toMessageArgs(args), result }))
			),
	})

	type Model = HashMap.HashMap<string, Data>
	type UpdateReturn = Update.Return<Model, Message, R>

	const store: CacheStore<Model, Args, A, E, Message, R> = {
		read: (model, args) => AsyncData.fromOptionOrIdle(HashMap.get(model, config.toKey(args))),
		write: (model, args, data) => HashMap.set(model, config.toKey(args), data),
		load: (args) => Fetch(args),
		interrupt: (args) =>
			Fetch.Interrupt(args, (outcome) => Message.CompletedCancelFetch({ args: toMessageArgs(args), outcome })),
	}

	const update = (model: Model, message: Message): UpdateReturn =>
		Message.match<UpdateReturn>(message, {
			RequestedRevalidate: ({ args }) => applyPolicy(store, model, args, "revalidate"),
			RequestedRevalidateOrLoad: ({ args }) => applyPolicy(store, model, args, "revalidateOrLoad"),
			RequestedLoadIfMissing: ({ args }) => applyPolicy(store, model, args, "loadIfMissing"),
			RequestedReplace: ({ args }) => replaceSlot(store, model, args),
			SettledFetch: ({ args, result }) => ({
				model: store.write(model, args, AsyncData.settle(store.read(model, args), result)),
			}),
			CompletedCancelFetch: ({ args, outcome }) => completeCancel(store, model, args, outcome),
		})

	const informRevalidate: {
		(model: Model, args: Args): UpdateReturn
		(args: Args): (model: Model) => UpdateReturn
	} = Function.dual(2, (model: Model, args: Args): UpdateReturn =>
		update(model, Message.RequestedRevalidate({ args: toMessageArgs(args) }))
	)
	const informRevalidateOrLoad: {
		(model: Model, args: Args): UpdateReturn
		(args: Args): (model: Model) => UpdateReturn
	} = Function.dual(2, (model: Model, args: Args): UpdateReturn =>
		update(model, Message.RequestedRevalidateOrLoad({ args: toMessageArgs(args) }))
	)
	const informLoadIfMissing: {
		(model: Model, args: Args): UpdateReturn
		(args: Args): (model: Model) => UpdateReturn
	} = Function.dual(2, (model: Model, args: Args): UpdateReturn =>
		update(model, Message.RequestedLoadIfMissing({ args: toMessageArgs(args) }))
	)
	const informReplace: {
		(model: Model, args: Args): UpdateReturn
		(args: Args): (model: Model) => UpdateReturn
	} = Function.dual(2, (model: Model, args: Args): UpdateReturn =>
		update(model, Message.RequestedReplace({ args: toMessageArgs(args) }))
	)

	const init = (): Model => HashMap.empty()

	const bind = <ParentModel, ParentMessage>(bindConfig: BindConfig<ParentModel, ParentMessage, Model, Message>) => {
		const step = (inform: {
			(model: Model, args: Args): UpdateReturn
			(args: Args): (model: Model) => UpdateReturn
		}): {
			(model: ParentModel, args: Args): Update.Return<ParentModel, ParentMessage, R>
			(args: Args): (model: ParentModel) => Update.Return<ParentModel, ParentMessage, R>
		} =>
			Function.dual(2, (model: ParentModel, args: Args): Update.Return<ParentModel, ParentMessage, R> =>
				bindFieldStep(inform(args), bindConfig)(model)
			)

		return {
			fold: bindFold(update, bindConfig),
			revalidate: step(informRevalidate),
			revalidateOrLoad: step(informRevalidateOrLoad),
			loadIfMissing: step(informLoadIfMissing),
			replace: step(informReplace),
		}
	}

	return {
		Model: Schema.HashMap(Schema.String, Data.schema),
		Message,
		Fetch,
		init,
		update,
		informRevalidate,
		informRevalidateOrLoad,
		informLoadIfMissing,
		informReplace,
		bind,
	}
}

/** Defines a remote-data Submodel. The Model is `AsyncData`. Settle, retry, and
 *  in-flight dedup live in this child's `update`. The parent folds `Got*` and
 *  drives loads with `inform*` helpers through `bind`. */
export const define: {
	<Name extends string, A, AI, E, EI, R = never>(
		config: FieldConfig<Name, A, AI, E, EI, R> & { readonly args?: never; readonly toKey?: never }
	): ReturnType<typeof defineField<Name, A, AI, E, EI, R>>
	<
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
	): ReturnType<typeof defineKeyed<Name, A, AI, E, EI, Fields, KeyField, R>>
} = ((config: FieldConfig<string, any, any, any, any, any> | KeyedConfig<string, any, any, any, any, any, any, any>) =>
	Predicate.hasProperty(config, "toKey")
		? defineKeyed(config as never)
		: defineField(config as never)) as typeof define

export type { BindConfig }
