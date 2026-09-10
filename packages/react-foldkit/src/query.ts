import { Array, Effect, Function, HashMap, Match, Option, Predicate, Schema, pipe } from "effect"
import * as AsyncData from "./asyncData"
import * as Command from "./command"
import { defineMessageUnion } from "./message"
import * as Update from "./update"

type Policy = "loadIfMissing" | "revalidate" | "revalidateOrLoad"

type FoldChildConfig<ParentModel, ParentMessage, ChildModel, ChildMessage> = Readonly<{
	read: (model: ParentModel) => Option.Option<ChildModel>
	write: (model: ParentModel, nextChildModel: ChildModel) => ParentModel
	toParentMessage: (message: ChildMessage) => ParentMessage
}>

// Nested Command.Interruptible.Outcome in defineMessageUnion collapses through tsup to
// `node_modules/foldkit/dist/schema` (and sometimes `outcome?: any`). Tags match Outcome.
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
	outcome: Command.Interruptible.Outcome
): Update.Return<Model, Message, R> =>
	Command.Interruptible.Outcome.match<Update.Return<Model, Message, R>>(outcome, {
		Interrupted: () => ({ model, commands: [store.load(args)] }),
		NotFound: () => applyPolicy(store, model, args, "revalidateOrLoad"),
	})

const childFold = <ParentModel, ParentMessage, ChildModel, ChildMessage, R>(
	update: (model: ChildModel, message: ChildMessage) => Update.Return<ChildModel, ChildMessage, R>,
	config: FoldChildConfig<ParentModel, ParentMessage, ChildModel, ChildMessage>
) => Update.foldChild({ update, ...config })

const childFoldStep = <ParentModel, ParentMessage, ChildModel, ChildMessage, R>(
	update: (model: ChildModel) => Update.Return<ChildModel, ChildMessage, R>,
	config: FoldChildConfig<ParentModel, ParentMessage, ChildModel, ChildMessage>
) => Update.foldChildStep({ update, ...config })

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

type Dual2<A, B, Out> = {
	(a: A, b: B): Out
	(b: B): (a: A) => Out
}

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

	const foldChild = <ParentModel, ParentMessage>(
		config: FoldChildConfig<ParentModel, ParentMessage, Model, Message>
	) => ({
		fold: childFold(update, config),
		revalidate: childFoldStep(informRevalidate, config),
		revalidateOrLoad: childFoldStep(informRevalidateOrLoad, config),
		loadIfMissing: childFoldStep(informLoadIfMissing, config),
		replace: childFoldStep(informReplace, config),
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
		foldChild,
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

	const inform = (build: (args: MessageArgs) => Message): Dual2<Model, Args, UpdateReturn> =>
		Function.dual(2, (model: Model, args: Args): UpdateReturn => update(model, build(toMessageArgs(args))))

	const informRevalidate = inform((args) => Message.RequestedRevalidate({ args }))
	const informRevalidateOrLoad = inform((args) => Message.RequestedRevalidateOrLoad({ args }))
	const informLoadIfMissing = inform((args) => Message.RequestedLoadIfMissing({ args }))
	const informReplace = inform((args) => Message.RequestedReplace({ args }))

	const init = (): Model => HashMap.empty()

	const foldChild = <ParentModel, ParentMessage>(
		config: FoldChildConfig<ParentModel, ParentMessage, Model, Message>
	) => {
		const step = (
			childInform: Dual2<Model, Args, UpdateReturn>
		): Dual2<ParentModel, Args, Update.Return<ParentModel, ParentMessage, R>> =>
			Function.dual(2, (model: ParentModel, args: Args): Update.Return<ParentModel, ParentMessage, R> =>
				childFoldStep(childInform(args), config)(model)
			)

		return {
			fold: childFold(update, config),
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
		foldChild,
	}
}

/** Defines a remote-data Submodel. The Model is `AsyncData`. Settle, retry, and
 *  in-flight dedup live in this child's `update`. The parent folds `Got*` and
 *  drives loads with `inform*` helpers through `foldChild`. */
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

export type { FoldChildConfig }
