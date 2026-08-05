import { Array, Effect, Function, Predicate, Schema } from "effect"

export const CommandTypeId: unique symbol = Symbol("ree/CommandTypeId")
export type CommandTypeId = typeof CommandTypeId

/** A named Effect that produces a message. */
export type Command<T, E = never, R = never> = [T] extends [Schema.Top]
	? Readonly<{
			[CommandTypeId]: CommandTypeId
			_tag: string
			args?: Record<string, unknown>
			effect: Effect.Effect<Schema.Schema.Type<T>, E, R>
		}>
	: Readonly<{
			[CommandTypeId]: CommandTypeId
			_tag: string
			args?: Record<string, unknown>
			effect: Effect.Effect<T, E, R>
		}>

/** @internal A single link in a Command's message-mapping chain. Each mapper
 *  lifts the previous result Message into the next Message space. Typed
 *  `(message: unknown) => unknown` because the chain is existential: only its
 *  end type, the Command's declared Message, is visible on {@link Command}. */
type MessageMapper = (message: unknown) => unknown

/** @internal The runtime shape a constructed Command actually carries: the
 *  public `name`/`args`/`effect` plus a message-mapping chain recording the
 *  `mapMessage`/`mapMessages` lifts applied to it. `mapMessage` fuses each lift
 *  into the `effect` (so production dispatch is unchanged) and also appends it
 *  here, purely as recoverable metadata: the Story/Scene test layer replays the
 *  chain over a substitute result so a root test never restates the wrapping.
 *  The runtime never reads it. Kept off the public {@link Command} type, and
 *  optional because Commands built by hand (not via {@link define}) carry no
 *  chain; readers treat its absence as an empty chain. */
type CommandWithMappers = Readonly<{
	[CommandTypeId]: CommandTypeId
	_tag: string
	args?: Record<string, unknown>
	effect: Effect.Effect<unknown, unknown, unknown>
	messageMappers?: ReadonlyArray<MessageMapper>
}>

const CommandDefinitionTypeId: unique symbol = Symbol("ree/CommandDefinitionTypeId")
export type CommandDefinitionTypeId = typeof CommandDefinitionTypeId

/** @internal The shape {@link define} reads at runtime. The public overloads
 *  carry the precise types; this is only what the implementation destructures. */
type DefineConfig = Readonly<{
	args?: Schema.Struct.Fields
	messages: ReadonlyArray<Schema.Top>
	execute: any
}>

/** A Command definition for a Command with no declared args. Call as `Definition()` to produce a Command instance. */
export interface CommandDefinitionNoArgs<Name extends string, Message, R = never> {
	readonly [CommandDefinitionTypeId]: CommandDefinitionTypeId
	readonly name: Name
	(): Command<Message, R>
}

/** A Command definition for a Command with declared args. Call as `Definition(args)` to produce a Command instance. */
export interface CommandDefinitionWithArgs<
	Name extends string,
	Fields extends Schema.Struct.Fields,
	Message,
	R = never,
> {
	readonly [CommandDefinitionTypeId]: CommandDefinitionTypeId
	readonly name: Name
	(args: Schema.Schema.Type<Schema.Struct<Fields>>): Command<Message, R>
}

// NOTE: The suspend is load bearing, not a redundant wrapper. Without it the
// `execute` body runs the moment update constructs the Command, so any
// expression it evaluates on the way to returning its Effect runs inside a pure
// reducer. Every side effect the body performs runs there, and every exception
// it raises escapes update, even when update discards the Command instead of
// returning it. Reading a missing browser global is one instance, the one that
// surfaced this, not the boundary of it. Suspending defers the body to
// execution, where the runtime can contain any failure it produces.
// A no-args `execute` is already an Effect value and needs no equivalent.
const suspendExecute = (config: DefineConfig, args: any): Effect.Effect<any, any, any> =>
	Effect.suspend(() => config.execute(args))

export function define<
	const Name extends string,
	Fields extends Schema.Struct.Fields,
	const Messages extends ReadonlyArray<Schema.Top>,
	Eff extends Effect.Effect<Schema.Schema.Type<Messages[number]>, any, any>,
>(
	name: Name,
	config: Readonly<{
		args: Fields
		messages: Messages
		execute: (args: Schema.Schema.Type<Schema.Struct<Fields>>) => Eff
	}>
): CommandDefinitionWithArgs<Name, Fields, Schema.Schema.Type<Messages[number]>>

export function define<
	const Name extends string,
	const Messages extends ReadonlyArray<Schema.Top>,
	Eff extends Effect.Effect<Schema.Schema.Type<Messages[number]>, any, any>,
>(
	name: Name,
	config: Readonly<{
		messages: Messages
		execute: Eff
	}>
): CommandDefinitionNoArgs<Name, Schema.Schema.Type<Messages[number]>>

export function define(_tag: string, config: DefineConfig): unknown {
	const isArgsDeclared = Predicate.isNotUndefined(config.args)

	if (isArgsDeclared)
		return (args: any): Command<any, any> => ({
			_tag,
			[CommandTypeId]: CommandTypeId,
			args,
			effect: suspendExecute(config, args) as any,
		})
	else
		return (): Command<any, any> => ({
			_tag,
			[CommandTypeId]: CommandTypeId,
			effect: config.execute,
		})
}

export const none = [] as const satisfies readonly Command<void>[]

/** Transforms the Effect inside a Command while preserving its tag, args, and
 *  message-mapping chain. Reach for this to adjust the Effect itself (provide a
 *  service, add a delay or retry), not to lift the result Message. Never use it
 *  to transform the result Message, even via
 *  `Effect.map(childMessage => Parent({ childMessage }))`. That dispatches
 *  correctly in production but is invisible to `Story`/`Scene` `resolve`, which
 *  replays only the recorded chain and never runs the Effect, so the test would
 *  see the child's raw Message instead of the wrapped one. Lift result Messages
 *  with {@link mapMessage} / {@link mapMessages}, which record the lift. */
export const mapEffect: {
	<A, E1, R1, B, E2, R2>(
		f: (effect: Effect.Effect<A, E1, R1>) => Effect.Effect<B, E2, R2>
	): (command: Command<A, E1, R1>) => Command<B, E2, R2>
	<A, E1, R1, B, E2, R2>(
		command: Command<A, E1, R1>,
		f: (effect: Effect.Effect<A, E1, R1>) => Effect.Effect<B, E2, R2>
	): Command<B, E2, R2>
} = Function.dual(
	2,
	<A, E1, R1, B, E2, R2>(
		command: Command<A, E1, R1>,
		f: (effect: Effect.Effect<A, E1, R1>) => Effect.Effect<B, E2, R2>
	): Command<B, E2, R2> =>
		({
			...command,
			effect: f(command.effect as Effect.Effect<A, E1, R1>),
		}) as unknown as Command<B, E2, R2>
)

/** Lifts a single Command's result Message through `f`, transforming
 *  `FromMessage` to `ToMessage`. The singular complement to
 *  {@link mapMessages}: reach for this when a child returns one Command
 *  (e.g. an animation leave Command), reach for `mapMessages` when it
 *  returns a list.
 *
 *  Fuses `f` into the Effect so production dispatch is unchanged, and also
 *  records `f` on the Command's internal message-mapping chain. The chain is
 *  recoverable metadata the runtime never reads: `Story.Command.resolve` and
 *  `Scene.Command.resolve` replay the matched Command's chain over a substitute
 *  result, so a root test resolves with the child's raw result Message and
 *  never restates the wrapping by hand.
 *
 *  Preserves the Command's `_tag` and `args` so traces still attribute
 *  it to the originating Submodel. When you need to transform the
 *  Effect itself (not just the result Message), reach for
 *  {@link mapEffect} instead. */
export const mapMessage: {
	<FromMessage, ToMessage, E = never, R = never>(
		command: Command<FromMessage, E, R>,
		f: (message: FromMessage) => ToMessage
	): Command<ToMessage, E, R>
	<FromMessage, ToMessage>(
		f: (message: FromMessage) => ToMessage
	): <E = never, R = never>(command: Command<FromMessage, E, R>) => Command<ToMessage, E, R>
} = Function.dual(
	2,
	<FromMessage, ToMessage, E = never, R = never>(
		command: Command<FromMessage, E, R>,
		f: (message: FromMessage) => ToMessage
	): Command<ToMessage, E, R> => {
		/* eslint-disable @typescript-eslint/consistent-type-assertions */
		const withMappers = command as unknown as CommandWithMappers
		return {
			...withMappers,
			effect: Effect.map(command.effect as Effect.Effect<FromMessage, E, R>, f),
			messageMappers: [...(withMappers.messageMappers ?? []), f as MessageMapper],
		} as unknown as Command<ToMessage, E, R>
		/* eslint-enable @typescript-eslint/consistent-type-assertions */
	}
)

/** Lifts every Command in a list through `f`, transforming the result
 *  Message type from `FromMessage` to `ToMessage`. Reach for this at the
 *  boundary where a child Submodel's `update` returns Commands typed in
 *  the child's Message and the parent needs them typed in the parent's
 *  Message:
 *
 *  ```ts
 *  GotChildMessage: ({ message }) => {
 *    const [nextChild, commands, maybeOutMessage] = Child.update(model.child, message)
 *    const mappedCommands = Command.mapMessages(
 *      commands,
 *      message => GotChildMessage({ message }),
 *    )
 *    // ...
 *  }
 *  ```
 *
 *  Fuses `f` into each Command's Effect and also records it on the Command's
 *  internal message-mapping chain, so production dispatch is unchanged while
 *  `Story.Command.resolve` / `Scene.Command.resolve` can recover the mapping
 *  from the matched Command.
 *  Preserves each Command's `_tag` and `args` so traces still attribute the
 *  Command to the originating Submodel. When you need to transform the Effect
 *  itself (not just the result Message), reach for {@link mapEffect} instead. */
export const mapMessages: {
	<FromMessage, ToMessage, E = never, R = never>(
		commands: ReadonlyArray<Command<FromMessage, E, R>>,
		f: (message: FromMessage) => ToMessage
	): ReadonlyArray<Command<ToMessage, E, R>>
	<FromMessage, ToMessage>(
		f: (message: FromMessage) => ToMessage
	): <E = never, R = never>(
		commands: ReadonlyArray<Command<FromMessage, E, R>>
	) => ReadonlyArray<Command<ToMessage, E, R>>
} = Function.dual(
	2,
	<FromMessage, ToMessage, E = never, R = never>(
		commands: ReadonlyArray<Command<FromMessage, E, R>>,
		f: (message: FromMessage) => ToMessage
	): ReadonlyArray<Command<ToMessage, E, R>> =>
		Array.map(commands, function (command) {
			return mapMessage(command, f)
		})
)
