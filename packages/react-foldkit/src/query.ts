import { Array, Effect, HashMap, Match, Option, Predicate, Schema, String as EffectString, pipe } from "effect"
import * as AsyncData from "./asyncData"
import * as Command from "./command"
import { defineMessageUnion } from "./message"
import * as Update from "./update"

export type Policy = "loadIfMissing" | "revalidate" | "revalidateOrLoad"

const returnUpdate = <Model, Message, R = never>(
	model: Model,
	commands: ReadonlyArray<Command.Command<Message, never, R>> | undefined
): Update.Return<Model, Message, R> =>
	Array.match(commands ?? [], {
		onEmpty: () => ({ model }),
		onNonEmpty: (nextCommands) => ({ model, commands: nextCommands }),
	})

const applyDataTransition = <A, E, Message, R>(
	data: AsyncData.AsyncData<A, E>,
	transition: (current: AsyncData.AsyncData<A, E>) => Option.Option<AsyncData.AsyncData<A, E>>,
	load: Command.Command<Message, never, R>
): Readonly<{
	data: AsyncData.AsyncData<A, E>
	commands: ReadonlyArray<Command.Command<Message, never, R>>
}> =>
	Option.match(transition(data), {
		onNone: () => ({ data, commands: [] }),
		onSome: (nextData) => ({ data: nextData, commands: [load] }),
	})

type Transition = <A, E>(data: AsyncData.AsyncData<A, E>) => Option.Option<AsyncData.AsyncData<A, E>>

const transitionFor = (policy: Policy): Transition =>
	Match.value(policy).pipe(
		Match.when("loadIfMissing", () => AsyncData.loadIfMissing),
		Match.when("revalidate", () => AsyncData.revalidate),
		Match.when("revalidateOrLoad", () => AsyncData.revalidateOrLoad),
		Match.exhaustive
	)

type BindConfig<ParentModel, ParentMessage, ChildModel, ChildMessage> = Readonly<{
	read: (model: ParentModel) => Option.Option<ChildModel>
	write: (model: ParentModel, nextChildModel: ChildModel) => ParentModel
	toParentMessage: (message: ChildMessage) => ParentMessage
}>

const FetchInterruptOutcome = defineMessageUnion({
	Interrupted: {},
	NotFound: {},
})

const bindChild = <ParentModel, ParentMessage, ChildModel, ChildMessage, R = never>(
	query: Readonly<{
		update: (model: ChildModel, message: ChildMessage) => Update.Return<ChildModel, ChildMessage, R>
		informRevalidate: (model: ChildModel) => Update.Return<ChildModel, ChildMessage, R>
		informRevalidateOrLoad: (model: ChildModel) => Update.Return<ChildModel, ChildMessage, R>
		informLoadIfMissing: (model: ChildModel) => Update.Return<ChildModel, ChildMessage, R>
	}>,
	config: BindConfig<ParentModel, ParentMessage, ChildModel, ChildMessage>
) => {
	const fold = Update.foldChild({
		update: query.update,
		read: config.read,
		write: config.write,
		toParentMessage: config.toParentMessage,
	})

	const revalidate = Update.foldChildStep({
		update: query.informRevalidate,
		read: config.read,
		write: config.write,
		toParentMessage: config.toParentMessage,
	})

	const revalidateOrLoad = Update.foldChildStep({
		update: query.informRevalidateOrLoad,
		read: config.read,
		write: config.write,
		toParentMessage: config.toParentMessage,
	})

	const loadIfMissing = Update.foldChildStep({
		update: query.informLoadIfMissing,
		read: config.read,
		write: config.write,
		toParentMessage: config.toParentMessage,
	})

	return { fold, revalidate, revalidateOrLoad, loadIfMissing }
}

const bindKeyed = <ParentModel, ParentMessage, ChildModel, ChildMessage, Args, R = never>(
	query: Readonly<{
		update: (model: ChildModel, message: ChildMessage) => Update.Return<ChildModel, ChildMessage, R>
		informRevalidate: (model: ChildModel, args: Args) => Update.Return<ChildModel, ChildMessage, R>
		informRevalidateOrLoad: (model: ChildModel, args: Args) => Update.Return<ChildModel, ChildMessage, R>
		informLoadIfMissing: (model: ChildModel, args: Args) => Update.Return<ChildModel, ChildMessage, R>
		informReplace: (model: ChildModel, args: Args) => Update.Return<ChildModel, ChildMessage, R>
	}>,
	config: BindConfig<ParentModel, ParentMessage, ChildModel, ChildMessage>
) => {
	const fold = Update.foldChild({
		update: query.update,
		read: config.read,
		write: config.write,
		toParentMessage: config.toParentMessage,
	})

	const step =
		(
			inform: (model: ChildModel, args: Args) => Update.Return<ChildModel, ChildMessage, R>
		): ((model: ParentModel, args: Args) => Update.Return<ParentModel, ParentMessage, R>) =>
		(model, args) =>
			Update.foldChildStep({
				update: (childModel: ChildModel) => inform(childModel, args),
				read: config.read,
				write: config.write,
				toParentMessage: config.toParentMessage,
			})(model)

	return {
		fold,
		revalidate: step(query.informRevalidate),
		revalidateOrLoad: step(query.informRevalidateOrLoad),
		loadIfMissing: step(query.informLoadIfMissing),
		replace: step(query.informReplace),
	}
}

type FieldConfig<A, AI, E, EI, R> = Readonly<{
	name: string
	data: Schema.Codec<A, AI>
	error: Schema.Codec<E, EI>
	execute: Effect.Effect<A, E, R>
}>

type KeyedConfig<A, AI, E, EI, Fields extends Schema.Struct.Fields, R> = Readonly<{
	name: string
	data: Schema.Codec<A, AI>
	error: Schema.Codec<E, EI>
	args: Fields
	toKey: (args: Schema.Schema.Type<Schema.Struct<Fields>>) => string
	execute: (args: Schema.Schema.Type<Schema.Struct<Fields>>) => Effect.Effect<A, E, R>
}>

const defineField = <A, AI, E, EI, R>(config: FieldConfig<A, AI, E, EI, R>) => {
	const Data = AsyncData.Schema(config.data, config.error)

	const Message = defineMessageUnion({
		RequestedRevalidate: {},
		RequestedRevalidateOrLoad: {},
		RequestedLoadIfMissing: {},
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
	type UpdateReturn = Update.Return<Model, Message, R>

	const applyPolicy = (model: Model, policy: Policy): UpdateReturn => {
		const applied = applyDataTransition(model, transitionFor(policy), Fetch())
		return returnUpdate(applied.data, applied.commands)
	}

	const update = (model: Model, message: Message): UpdateReturn =>
		Message.match<UpdateReturn>(message, {
			RequestedRevalidate: () => applyPolicy(model, "revalidate"),
			RequestedRevalidateOrLoad: () => applyPolicy(model, "revalidateOrLoad"),
			RequestedLoadIfMissing: () => applyPolicy(model, "loadIfMissing"),
			SettledFetch: ({ result }) => ({
				model: AsyncData.settle(model, result),
			}),
			CompletedCancelFetch: ({ outcome }) =>
				Match.value(outcome).pipe(
					Match.withReturnType<UpdateReturn>(),
					Match.tag("Interrupted", () => ({ model, commands: [Fetch()] })),
					Match.tag("NotFound", () => applyPolicy(model, "revalidateOrLoad")),
					Match.exhaustive
				),
		})

	const informRevalidate = (model: Model): UpdateReturn => update(model, Message.RequestedRevalidate())
	const informRevalidateOrLoad = (model: Model): UpdateReturn => update(model, Message.RequestedRevalidateOrLoad())
	const informLoadIfMissing = (model: Model): UpdateReturn => update(model, Message.RequestedLoadIfMissing())

	const init = (): Model => AsyncData.Idle()

	const bind = <ParentModel, ParentMessage>(bindConfig: BindConfig<ParentModel, ParentMessage, Model, Message>) => {
		const bound = bindChild(
			{
				update,
				informRevalidate,
				informRevalidateOrLoad,
				informLoadIfMissing,
			},
			bindConfig
		)

		const replace = Update.foldChildStep({
			update: (childModel: Model) => {
				if (!AsyncData.isPending(childModel)) {
					return applyPolicy(childModel, "revalidateOrLoad")
				}
				return {
					model: childModel,
					commands: [Fetch.Interrupt((outcome) => Message.CompletedCancelFetch({ outcome }))],
				}
			},
			read: bindConfig.read,
			write: bindConfig.write,
			toParentMessage: bindConfig.toParentMessage,
		})

		return { ...bound, replace }
	}

	return {
		Model: Data.schema,
		Message,
		Fetch,
		init,
		update,
		informRevalidate,
		informRevalidateOrLoad,
		informLoadIfMissing,
		bind,
	}
}

const defineKeyed = <A, AI, E, EI, Fields extends Schema.Struct.Fields, R>(
	config: KeyedConfig<A, AI, E, EI, Fields, R>
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

	const keyFields = Object.keys(config.args)
	if (!Array.isArrayNonEmpty(keyFields)) {
		throw new Error(`Query.define "${config.name}" requires at least one args field`)
	}

	const Fetch: any = Command.define(`Fetch${config.name}`, {
		args: config.args,
		messages: [Message.SettledFetch],
		interrupt: {
			keyFields,
			toKey: config.toKey,
		},
		execute: (args: Args) =>
			pipe(
				config.execute(args),
				Effect.result,
				Effect.map((result) => Message.SettledFetch({ args: args as never, result }))
			),
	} as never)

	type Model = HashMap.HashMap<string, Data>
	type UpdateReturn = Update.Return<Model, Message, R>

	const readEntry = (model: Model, args: Args): Data =>
		AsyncData.fromOptionOrIdle(HashMap.get(model, config.toKey(args)))

	const writeEntry = (model: Model, args: Args, data: Data): Model => HashMap.set(model, config.toKey(args), data)

	const loadFor = (args: Args) => Fetch(args)

	const applyPolicy = (model: Model, args: Args, policy: Policy): UpdateReturn =>
		Option.match(transitionFor(policy)(readEntry(model, args)), {
			onNone: () => ({ model }),
			onSome: (nextData) => ({
				model: writeEntry(model, args, nextData),
				commands: [loadFor(args)],
			}),
		})

	const update = (model: Model, message: Message): UpdateReturn =>
		Message.match<UpdateReturn>(message, {
			RequestedRevalidate: ({ args }) => applyPolicy(model, args, "revalidate"),
			RequestedRevalidateOrLoad: ({ args }) => applyPolicy(model, args, "revalidateOrLoad"),
			RequestedLoadIfMissing: ({ args }) => applyPolicy(model, args, "loadIfMissing"),
			RequestedReplace: ({ args }) => {
				const current = readEntry(model, args)
				if (!AsyncData.isPending(current)) {
					return applyPolicy(model, args, "revalidateOrLoad")
				}
				return {
					model,
					commands: [
						Fetch.Interrupt(args, (outcome: any) =>
							Message.CompletedCancelFetch({ args: args as never, outcome })
						),
					],
				}
			},
			SettledFetch: ({ args, result }) => ({
				model: writeEntry(model, args, AsyncData.settle(readEntry(model, args), result)),
			}),
			CompletedCancelFetch: ({ args, outcome }) =>
				Match.value(outcome).pipe(
					Match.withReturnType<UpdateReturn>(),
					Match.tag("Interrupted", () => ({ model, commands: [loadFor(args)] })),
					Match.tag("NotFound", () => applyPolicy(model, args, "revalidateOrLoad")),
					Match.exhaustive
				),
		})

	const informRevalidate = (model: Model, args: Args): UpdateReturn =>
		update(model, Message.RequestedRevalidate({ args: args as never }))
	const informRevalidateOrLoad = (model: Model, args: Args): UpdateReturn =>
		update(model, Message.RequestedRevalidateOrLoad({ args: args as never }))
	const informLoadIfMissing = (model: Model, args: Args): UpdateReturn =>
		update(model, Message.RequestedLoadIfMissing({ args: args as never }))
	const informReplace = (model: Model, args: Args): UpdateReturn =>
		update(model, Message.RequestedReplace({ args: args as never }))

	const init = (): Model => HashMap.empty()

	const bind = <ParentModel, ParentMessage>(bindConfig: BindConfig<ParentModel, ParentMessage, Model, Message>) =>
		bindKeyed(
			{
				update,
				informRevalidate,
				informRevalidateOrLoad,
				informLoadIfMissing,
				informReplace,
			},
			bindConfig
		)

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
	<A, AI, E, EI, R = never>(
		config: FieldConfig<A, AI, E, EI, R> & { readonly args?: never; readonly toKey?: never }
	): ReturnType<typeof defineField<A, AI, E, EI, R>>
	<A, AI, E, EI, Fields extends Schema.Struct.Fields, R = never>(
		config: KeyedConfig<A, AI, E, EI, Fields, R>
	): ReturnType<typeof defineKeyed<A, AI, E, EI, Fields, R>>
} = ((config: FieldConfig<any, any, any, any, any> | KeyedConfig<any, any, any, any, any, any>) =>
	Predicate.hasProperty(config, "toKey") ? defineKeyed(config as any) : defineField(config as any)) as typeof define

type AnyQuery = Readonly<{
	Model: Schema.Schema<any>
	Message: Schema.Schema<any> & Record<string, any>
	init: () => unknown
	update: (model: any, message: any) => Update.Return<any, any, any>
	informRevalidate: (...args: Array<any>) => Update.Return<any, any, any>
	informRevalidateOrLoad: (...args: Array<any>) => Update.Return<any, any, any>
	informLoadIfMissing: (...args: Array<any>) => Update.Return<any, any, any>
	bind: (config: BindConfig<any, any, any, any>) => any
}>

const wrapperTag = (key: string): string => EffectString.capitalize(key)

/** Combines several {@link define}d queries into one cache Submodel. The Model is
 *  a struct of the member Models. Each member's Messages are wrapped under a
 *  capitalized member name, so the parent keeps a single `Got*` fold. */
export const group = <const Members extends Record<string, AnyQuery>>(members: Members) => {
	const memberKeys = Object.keys(members)

	const modelFields: Record<string, Schema.Schema<any>> = {}
	const messageCases: Record<string, Schema.Struct.Fields> = {}

	for (const key of memberKeys) {
		const member = members[key]
		if (member === undefined) {
			continue
		}
		modelFields[key] = member.Model
		messageCases[wrapperTag(key)] = { message: member.Message }
	}

	const Model = Schema.Struct(modelFields)
	const Message = defineMessageUnion(messageCases)

	const folds: Record<string, any> = {}

	for (const key of memberKeys) {
		const member = members[key]
		if (member === undefined) {
			continue
		}
		const tag = wrapperTag(key)
		folds[tag] = Update.foldChild({
			update: member.update,
			read: (model: any) => Option.some(model[key]),
			write: (model: any, nextChildModel: unknown) => ({
				...model,
				[key]: nextChildModel,
			}),
			toParentMessage: (message: unknown) => (Message as any)[tag]({ message }),
		})
	}

	const update = (model: any, message: { readonly _tag: string; readonly message: unknown }) => {
		const fold = folds[message._tag]
		if (fold === undefined) {
			return { model }
		}
		return fold(model, message.message)
	}

	const init = (): any => {
		const model: Record<string, unknown> = {}
		for (const key of memberKeys) {
			const member = members[key]
			if (member === undefined) {
				continue
			}
			model[key] = member.init()
		}
		return model
	}

	const bind = <ParentModel, ParentMessage>(config: BindConfig<ParentModel, ParentMessage, any, any>) => {
		const fold = Update.foldChild({
			update,
			read: config.read,
			write: config.write,
			toParentMessage: config.toParentMessage,
		})

		const boundMembers: Record<string, unknown> = {}

		for (const key of memberKeys) {
			const member = members[key]
			if (member === undefined) {
				continue
			}
			const tag = wrapperTag(key)
			boundMembers[key] = member.bind({
				read: (parent: ParentModel) =>
					pipe(
						config.read(parent),
						Option.map((groupModel) => groupModel[key])
					),
				write: (parent: ParentModel, nextChild: unknown) =>
					pipe(
						config.read(parent),
						Option.match({
							onNone: () => parent,
							onSome: (groupModel) =>
								config.write(parent, {
									...groupModel,
									[key]: nextChild,
								}),
						})
					),
				toParentMessage: (message: unknown) => config.toParentMessage((Message as any)[tag]({ message })),
			})
		}

		return {
			fold,
			members: boundMembers as { [K in keyof Members]: ReturnType<Members[K]["bind"]> },
		}
	}

	return {
		Model,
		Message,
		init,
		update,
		bind,
	}
}

export type { BindConfig }
