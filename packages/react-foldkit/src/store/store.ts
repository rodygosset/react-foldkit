import {
	Cause,
	Context,
	Deferred,
	Effect,
	Exit,
	Fiber,
	Function,
	Layer,
	MutableList,
	Option,
	PubSub,
	Result,
	Scheduler,
	Schema,
	Scope,
} from "effect"
import * as InitCommand from "../internal/initCommand"
import { CurrentInterruptRegistry, type InterruptRegistry, makeInterruptRegistry } from "../internal/interrupt"
import type * as Subscription from "../subscription"
import type * as Update from "../update"
import { browserScheduler } from "./scheduler"
import { forkSubscriptionFibers } from "./subscriptions"

/**
 * The update function and Subscriptions that describe a Foldkit application.
 * Pass a Program to `make` when its Commands and Subscriptions use services provided by the
 * surrounding Effect. Use `Config` when the Store should build its own service Layer.
 *
 * @see {@link Config} for supplying services through a Layer
 * @category models
 * @since 0.1.0
 */
export type Program<Model, Message, R = never> = {
	/**
	 * Applies a Message to the Model without running side effects. Return Commands for work that
	 * runs after the transition.
	 */
	update: (model: Model, message: Message) => Update.Return<Model, Message, R>
	/**
	 * Declares Streams whose dependencies are derived from the Model. Changed dependencies
	 * restart their Streams.
	 */
	subscriptions?: Subscription.Subscriptions<Model, Message, R>
	/**
	 * Called once on terminal failure, with the original Cause and a Message when one triggered
	 * the failure. Observer defects are logged.
	 */
	onCrash?: (cause: Cause.Cause<unknown>, triggeringMessage: Option.Option<Message>) => void
}

/**
 * A Program with a Layer that provides the services its Commands and Subscriptions need.
 * Use this configuration with React or `boot`, where there is no surrounding Effect Context
 * to supply those services.
 *
 * The Layer must require no additional services and have no typed failures. It is optional
 * when the Program requires no services. The Store builds it when live work first needs it.
 *
 * @see {@link make} for running a Program with services from an Effect host
 * @category configuration
 * @since 0.1.0
 */
export type Config<Model, Message, R = never> = [R] extends [never]
	? Program<Model, Message, R> & {
			/**
			 * Supplies all required services. Live work finishes before the Layer releases its
			 * resources.
			 */
			layer?: Layer.Layer<never, never, never>
		}
	: Program<Model, Message, R> & {
			/**
			 * Supplies all required services. Live work finishes before the Layer releases its
			 * resources.
			 */
			layer: Layer.Layer<NoInfer<R>, never, never>
		}

/**
 * Identifies Store instances across package entry points.
 *
 * @category type IDs
 * @since 0.1.0
 */
export const StoreTypeId: unique symbol = Symbol.for("react-foldkit/StoreTypeId")
/**
 * Type of the Store instance identifier.
 *
 * @category type IDs
 * @since 0.1.0
 */
export type StoreTypeId = typeof StoreTypeId

/**
 * A running Foldkit application, with a Model and a queue of Messages to process.
 * Use it to send Messages, read the current Model, and observe changes outside React.
 * The Store runs the Commands and Subscriptions returned by the Program.
 *
 * A crash stops Message processing and releases live work. The last Model and crash Cause
 * remain available after a crash or disposal.
 *
 * @category models
 * @since 0.1.0
 */
export type Store<Model, Message> = Readonly<{
	[StoreTypeId]: StoreTypeId
	/**
	 * Reads the current Model synchronously. Snapshots must remain immutable.
	 */
	getModel: () => Model
	/**
	 * Reads the terminal crash Cause, retained after disposal.
	 */
	getCrash: () => Option.Option<Cause.Cause<unknown>>
	/**
	 * Calls the listener when the Store crashes. An existing crash is not replayed.
	 * Returns a function that removes the listener.
	 */
	subscribeCrash: (listener: () => void) => () => void
	/**
	 * Notifies the listener synchronously when a new Model is published or the Store is disposed.
	 * It does not replay the current Model. Read snapshots with `getModel`. Defects during Model
	 * notifications are logged.
	 * Returns a function that removes the listener.
	 */
	subscribe: (listener: () => void) => () => void
	/**
	 * Queues a Message after earlier Messages. Processing may finish during this call or be
	 * deferred. Use `commit` when you need delivery to finish before continuing. A crashed or
	 * disposed Store ignores new Messages.
	 */
	dispatch: (message: Message) => void
	/**
	 * Sends a Message and processes the queue through it before returning. Returned Commands
	 * may still be running. Use the Result to check delivery failures.
	 */
	commit: (message: Message) => Result.Result<void, CommitError>
	/**
	 * Creates an Effect that stops Commands and Subscriptions, then releases their services.
	 * Repeated calls share the same cleanup result. Cleanup defects fail the Effect.
	 */
	dispose: () => Effect.Effect<void>
	/**
	 * Reports whether explicit disposal has begun. A crash alone does not mark the Store
	 * disposed.
	 */
	isDisposed: () => boolean
}>

/**
 * The failure returned by `takeWhen` when its Store has been disposed.
 *
 * @see {@link takeWhen} for waiting on a Model change
 * @category errors
 * @since 0.1.0
 */
export class Disposed extends Schema.Error<Disposed>("react-foldkit/Store/Disposed")({
	_tag: Schema.tag("Disposed"),
}) {}

/**
 * The failure returned by `takeWhen` when its Store has crashed.
 * `cause` is the original crash Cause, with its annotations preserved.
 *
 * @see {@link takeWhen} for waiting on a Model change
 * @category errors
 * @since 0.1.0
 */
export class Crashed extends Schema.Error<Crashed>("react-foldkit/Store/Crashed")({
	_tag: Schema.tag("Crashed"),
	cause: Schema.declare<Cause.Cause<unknown>>(Cause.isCause),
}) {}

/**
 * A Message delivery failure returned by `commit`.
 * Inspect `details.reason` to distinguish an inactive, reentrant, disposed, or crashed Store.
 * For `Crashed`, `details.cause` contains the original crash Cause.
 *
 * A failure does not undo Model changes already applied while processing Messages.
 *
 * @see {@link commit} for sending a Message from an Effect
 * @category errors
 * @since 0.1.0
 */
export class CommitError extends Schema.Error<CommitError>("react-foldkit/Store/CommitError")({
	_tag: Schema.tag("CommitError"),
	details: Schema.Union([
		Schema.Struct({
			reason: Schema.Literals(["Inactive", "Reentrant", "Disposed"]),
		}),
		Schema.Struct({
			reason: Schema.Literal("Crashed"),
			cause: Schema.declare<Cause.Cause<unknown>>(Cause.isCause),
		}),
	]),
}) {
	get message(): string {
		return "Cannot commit: store is " + this.details.reason.toLowerCase()
	}
}

/**
 * Creates an Effect that sends a Message and processes the queue through that Message.
 * Use it when subsequent Effect steps need to read the updated Model.
 *
 * The Store processes earlier queued Messages first. The Effect succeeds once this Message's
 * update has finished. It does not wait for returned Commands to finish.
 *
 * The Effect fails with `CommitError` if delivery is inactive, reentrant, disposed, or crashed.
 * Failure does not undo Model changes already applied. Call as `commit(store, message)` or
 * `store.pipe(commit(message))`.
 *
 * @see {@link make} for an example that commits and reads a Model
 * @category sequencing
 * @since 0.1.0
 */
export const commit: {
	<Message>(message: Message): <Model>(self: Store<Model, Message>) => Effect.Effect<void, CommitError>
	<Model, Message>(self: Store<Model, Message>, message: NoInfer<Message>): Effect.Effect<void, CommitError>
} = Function.dual(2, <Model, Message>(self: Store<Model, Message>, message: Message) =>
	Effect.suspend(() => Effect.fromResult(self.commit(message)))
)

/**
 * Waits for a Model value selected with `Option.Some`.
 * Use it to await a result produced by a Command or Subscription without polling the Store.
 *
 * **Details**
 *
 * The Effect checks the current Model first. If the selector returns `None`, it waits for
 * changes and checks again. It removes its listeners on completion or interruption.
 *
 * A crashed Store fails with `Crashed`; a disposed Store fails with `Disposed`. These failures
 * take priority even if the last Model matches. Exceptions from the selector become defects.
 *
 * **Example** (Waiting for a loaded project title)
 *
 * ```ts
 * import { Effect, Option, Schema } from "effect"
 * import { defineMessageUnion } from "react-foldkit/message"
 * import * as Store from "react-foldkit/store"
 * import { modifyFields } from "react-foldkit/struct"
 *
 * type Model = { readonly projectTitle: Option.Option<string> }
 *
 * const Message = defineMessageUnion({ LoadedProject: { title: Schema.String } })
 * type Message = typeof Message.Type
 *
 * const program = Effect.scoped(
 * 	Effect.gen(function* () {
 * 		const store = yield* Store.make(
 * 			{
 * 				update: (model: Model, message: Message) => ({
 * 					model: modifyFields(model, { projectTitle: () => Option.some(message.title) }),
 * 				}),
 * 			},
 * 			{
 * 				model: { projectTitle: Option.none<string>() },
 * 				commands: [
 * 					{ name: "LoadProject", effect: Effect.succeed(Message.LoadedProject({ title: "Foldkit" })) },
 * 				],
 * 			}
 * 		)
 *
 * 		return yield* Store.takeWhen(store, (model) => model.projectTitle)
 * 	})
 * )
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @see {@link Crashed} for the crash Cause
 * @see {@link Disposed} for disposal failures
 * @category getters
 * @since 0.1.0
 */
export const takeWhen: {
	<Model, A>(
		pick: (model: Model) => Option.Option<A>
	): <Message>(self: Store<Model, Message>) => Effect.Effect<A, Disposed | Crashed>
	<Model, Message, A>(
		self: Store<Model, Message>,
		pick: (model: Model) => Option.Option<A>
	): Effect.Effect<A, Disposed | Crashed>
} = Function.dual(2, <Model, Message, A>(store: Store<Model, Message>, pick: (model: Model) => Option.Option<A>) =>
	Effect.callback<A, Disposed | Crashed>(function (resume) {
		let settled = false
		let unsubscribeModel = Function.constVoid
		let unsubscribeCrash = Function.constVoid
		function cleanup(): void {
			unsubscribeModel()
			unsubscribeCrash()
		}
		function check(): void {
			if (settled) return
			const crash = store.getCrash()
			const result: Exit.Exit<Option.Option<A>, Disposed | Crashed> = Option.isSome(crash)
				? Exit.fail(
						new Crashed({
							cause: crash.value,
						})
					)
				: store.isDisposed()
					? Exit.fail(new Disposed())
					: Effect.runSyncExit(Effect.sync(() => pick(store.getModel())))
			if (Exit.isFailure(result)) {
				settled = true
				cleanup()
				resume(Effect.failCause(result.cause))
			} else if (Option.isSome(result.value)) {
				settled = true
				cleanup()
				resume(Effect.succeed(result.value.value))
			}
		}
		check()
		if (settled) return
		unsubscribeModel = store.subscribe(check)
		unsubscribeCrash = store.subscribeCrash(check)
		// A synchronous subscription may settle before it returns its cleanup handle.
		if (settled) cleanup()
		return Effect.sync(cleanup)
	})
)

const DRAIN_BUDGET_MS = 5

type Phase =
	| { readonly _tag: "Booting" }
	| { readonly _tag: "Live"; readonly drain: "Idle" | "Sync" | "Deferred" }
	| { readonly _tag: "Crashed"; readonly cause: Cause.Cause<unknown> }
	| { readonly _tag: "Disposed"; readonly crash: Option.Option<Cause.Cause<unknown>> }

const isTerminal = (phase: Phase): boolean => phase._tag === "Crashed" || phase._tag === "Disposed"

const canEnterDrain = (phase: Phase): boolean => phase._tag === "Live" && phase.drain === "Idle"

const makeProvideAllResources =
	<R>(
		acquireResourceContext: Effect.Effect<Context.Context<R>>,
		interruptRegistry: InterruptRegistry
	): (<A, E>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E>) =>
	<A, E>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E> =>
		Effect.flatMap(acquireResourceContext, (ctx) =>
			Effect.provideService(Effect.provideContext(effect, ctx), CurrentInterruptRegistry, interruptRegistry)
		)

/**
 * Creates a Store managed by an Effect Scope.
 * Use it in `Effect.scoped` or another scoped Effect so cleanup runs when that work ends.
 *
 * Closing the Scope stops Commands and Subscriptions before releasing their services. Without
 * a `layer`, the Store uses services from the calling Effect's Context. A supplied Layer is
 * built when live work first needs it.
 *
 * **Example** (Sending a Message and reading the updated Model)
 *
 * ```ts
 * import { Effect } from "effect"
 * import { defineMessageUnion } from "react-foldkit/message"
 * import * as Store from "react-foldkit/store"
 * import { modifyFields } from "react-foldkit/struct"
 *
 * type Model = { readonly count: number }
 *
 * const Message = defineMessageUnion({ ClickedIncrement: {} })
 * type Message = typeof Message.Type
 *
 * const update = (model: Model, _message: Message) => ({
 * 	model: modifyFields(model, { count: (count) => count + 1 }),
 * })
 *
 * const program = Effect.scoped(
 * 	Effect.gen(function* () {
 * 		const store = yield* Store.make({ update }, { model: { count: 0 } })
 * 		yield* Store.commit(store, Message.ClickedIncrement())
 *
 * 		return store.getModel().count
 * 	})
 * )
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @see {@link boot} for creating a Store with explicit cleanup
 * @category constructors
 * @since 0.1.0
 */
export function make<Model, Message, R = never>(
	config: Config<Model, Message, R>,
	init: Update.Return<Model, Message, R>
): Effect.Effect<Store<Model, Message>, never, Scope.Scope>
export function make<Model, Message, R = never>(
	config: Program<Model, Message, R> & { readonly layer?: never },
	init: Update.Return<Model, Message, R>
): Effect.Effect<Store<Model, Message>, never, R | Scope.Scope>
// eslint-disable-next-line foldkit-style/prefer-arrow-for-expression-return -- Overloads distinguish provided and ambient services.
export function make<Model, Message, R = never>(
	config: Program<Model, Message, R> & { readonly layer?: Layer.Layer<NoInfer<R>, never, never> },
	init: Update.Return<Model, Message, R>
): Effect.Effect<Store<Model, Message>, never, R | Scope.Scope> {
	return Effect.gen(function* () {
		const ambient = yield* Effect.context<R>()
		const runtimeContext = Context.add(ambient, Scheduler.Scheduler, browserScheduler)
		const scope = yield* Scope.fork(yield* Scope.Scope, "sequential")
		// Finish Commands and subscriptions before releasing their services.
		const layerScope = yield* Scope.fork(scope)
		const fiberScope = yield* Scope.fork(scope, "parallel")
		const modelPubSub = yield* PubSub.unbounded<Model>()
		const layer = config.layer
		const getBuild = yield* Effect.cached(
			Effect.forkIn(
				layer === undefined ? Effect.succeed(ambient) : Layer.buildWithScope(layer, layerScope),
				layerScope,
				{
					uninterruptible: false,
				}
			).pipe(Effect.uninterruptible)
		)
		const acquireResourceContext = Effect.flatMap(getBuild, Fiber.join)
		let closingExit: Exit.Exit<unknown, unknown> | undefined
		const closed = yield* Effect.cached(Effect.suspend(() => Scope.close(scope, closingExit ?? Exit.void)))
		const closeResources = (exit: Exit.Exit<unknown, unknown>) =>
			Effect.suspend(function () {
				closingExit ??= exit
				return closed
			})
		return yield* Effect.acquireRelease(
			Effect.sync(() =>
				start(config, init, fiberScope, modelPubSub, acquireResourceContext, runtimeContext, closeResources)
			),
			(store, exit) => store.dispose(exit)
		)
	})
}

/**
 * Creates a Store synchronously, with cleanup managed by the caller.
 * Use it when the host creates the Store outside a scoped Effect. Run `store.dispose()` when
 * the host no longer needs it, including when the host's work fails.
 *
 * Provide required services through `config.layer`. Unlike `make`, `boot` cannot receive
 * services from a surrounding Effect Context.
 *
 * **Example** (Using a Store with explicit cleanup)
 *
 * ```ts
 * import { Effect, Result } from "effect"
 * import { defineMessageUnion } from "react-foldkit/message"
 * import * as Store from "react-foldkit/store"
 * import { modifyFields } from "react-foldkit/struct"
 *
 * type Model = { readonly count: number }
 *
 * const Message = defineMessageUnion({ ClickedIncrement: {} })
 * type Message = typeof Message.Type
 *
 * const store = Store.boot(
 * 	{
 * 		update: (model: Model, _message: Message) => ({
 * 			model: modifyFields(model, { count: (count) => count + 1 }),
 * 		}),
 * 	},
 * 	{ model: { count: 0 } }
 * )
 *
 * try {
 * 	Result.getOrThrow(store.commit(Message.ClickedIncrement()))
 * } finally {
 * 	await Effect.runPromise(store.dispose())
 * }
 * ```
 *
 * @see {@link make} for automatic cleanup through an Effect Scope
 * @category constructors
 * @since 0.1.0
 */
export function boot<Model, Message, R = never>(
	config: Config<Model, Message, R>,
	init: Update.Return<Model, Message, R>
): Store<Model, Message> {
	const scope = Scope.makeUnsafe()
	return Effect.runSync(
		make(config, init).pipe(
			Scope.provide(scope),
			Effect.onExit((exit) => (Exit.isFailure(exit) ? Scope.close(scope, exit) : Effect.void))
		)
	)
}

function start<Model, Message, R>(
	config: Program<Model, Message, R>,
	init: Update.Return<Model, Message, R>,
	fiberScope: Scope.Scope,
	modelPubSub: PubSub.PubSub<Model>,
	acquireResourceContext: Effect.Effect<Context.Context<R>>,
	runtimeContext: Context.Context<never>,
	closeResources: (exit: Exit.Exit<unknown, unknown>) => Effect.Effect<void>
) {
	const listeners = new Set<() => void>()
	const crashListeners = new Set<() => void>()
	type PendingMessage = {
		readonly message: Message
		readonly command?: Update.Commands<Message, R>[number]
	}
	const pendingMessages = MutableList.make<PendingMessage>()
	let phase: Phase = {
		_tag: "Booting",
	}
	let syncWorkMsSinceYield = 0
	let lastDrainEndedAt = 0
	let deferredDrainChannel: MessageChannel | null = null

	const interruptRegistry = makeInterruptRegistry()
	const initialModel = init.model
	const initCommands = init.commands ?? []
	let model: Model = initialModel
	PubSub.publishUnsafe(modelPubSub, model)

	const provideAllResources = makeProvideAllResources(acquireResourceContext, interruptRegistry)
	function getCrash(): Option.Option<Cause.Cause<unknown>> {
		switch (phase._tag) {
			case "Booting":
			case "Live":
				return Option.none()
			case "Crashed":
				return Option.some(phase.cause)
			case "Disposed":
				return phase.crash
		}
	}

	function crashWith(cause: Cause.Cause<unknown>, triggeringMessage: Option.Option<Message>): void {
		if (isTerminal(phase)) return
		phase = {
			_tag: "Crashed",
			cause,
		}
		MutableList.clear(pendingMessages)
		cancelDeferredDrain()
		Effect.runForkWith(runtimeContext)(
			closeResources(Exit.failCause(cause)).pipe(Effect.catchCause(Effect.logError))
		)
		const observers = [...crashListeners]
		for (const listener of observers) {
			const exit = Effect.runSyncExit(Effect.sync(listener))
			if (Exit.isFailure(exit)) Effect.runForkWith(runtimeContext)(Effect.logError(exit.cause))
		}
		if (config.onCrash !== undefined) {
			const exit = Effect.runSyncExit(Effect.sync(() => config.onCrash?.(cause, triggeringMessage)))
			if (Exit.isFailure(exit)) Effect.runForkWith(runtimeContext)(Effect.logError(exit.cause))
		} else
			Effect.runForkWith(runtimeContext)(Effect.logError("[react-foldkit] Store crashed:", Cause.pretty(cause)))
	}

	function enqueueMessage(message: Message, command?: Update.Commands<Message, R>[number]): void {
		if (isTerminal(phase)) return
		MutableList.append(pendingMessages, { message, command })
		if (phase._tag === "Booting") return
		drainPendingMessages()
	}

	function publishModel(nextModel: Model): void {
		PubSub.publishUnsafe(modelPubSub, nextModel)
	}

	function cancelDeferredDrain(): void {
		if (deferredDrainChannel === null) return
		deferredDrainChannel.port1.close()
		deferredDrainChannel.port2.close()
		deferredDrainChannel = null
	}

	function scheduleDeferredDrain(): void {
		if (phase._tag !== "Live" || phase.drain === "Deferred") return
		if (deferredDrainChannel === null) {
			const channel = new MessageChannel()
			deferredDrainChannel = channel
			channel.port2.onmessage = function () {
				// A commit can overtake this task and replace its channel.
				if (deferredDrainChannel !== channel || phase._tag !== "Live" || phase.drain !== "Deferred") return
				phase = {
					_tag: "Live",
					drain: "Idle",
				}
				syncWorkMsSinceYield = 0
				drainPendingMessages()
			}
		}
		phase = {
			_tag: "Live",
			drain: "Deferred",
		}
		deferredDrainChannel.port1.postMessage(null)
	}

	function forkCommand(
		command: Update.Commands<Message, R>[number],
		triggeringMessage: Option.Option<Message>
	): void {
		const effect = Effect.suspend(function () {
			if (isTerminal(phase)) return Effect.void

			// Foldkit Command accepts a Schema or its Type; this runtime dispatches values.
			return (command.effect as Effect.Effect<Message, never, R>).pipe(
				Effect.withSpan(command.name, {
					attributes: command.args ?? {},
				}),
				provideAllResources,
				Effect.flatMap((message) =>
					Effect.sync(function () {
						enqueueMessage(message, command)
					})
				),
				Effect.catchCause((cause) =>
					Effect.sync(function () {
						crashWith(cause, triggeringMessage)
					})
				)
			)
		})
		Effect.runForkWith(runtimeContext)(Effect.forkIn(effect, fiberScope))
	}

	function processMessage({ message, command }: PendingMessage): void {
		try {
			const result = config.update(model, message)
			const previous = model
			model = result.model
			if (command !== undefined) InitCommand.complete(command)
			if (previous !== result.model) {
				publishModel(result.model)
				const observers = [...listeners]
				for (const listener of observers) {
					const exit = Effect.runSyncExit(Effect.sync(listener))
					if (Exit.isFailure(exit)) Effect.runForkWith(runtimeContext)(Effect.logError(exit.cause))
				}
			}
			for (const command of result.commands ?? []) forkCommand(command, Option.some(message))
		} catch (error) {
			crashWith(Cause.die(error), Option.some(message))
		}
	}

	function drainPendingMessages(until?: PendingMessage): void {
		if (!canEnterDrain(phase)) return

		const drainStartedAt = performance.now()
		if (drainStartedAt - lastDrainEndedAt > DRAIN_BUDGET_MS) syncWorkMsSinceYield = 0

		if (until === undefined && syncWorkMsSinceYield > DRAIN_BUDGET_MS) {
			scheduleDeferredDrain()
			return
		}

		phase = {
			_tag: "Live",
			drain: "Sync",
		}
		let currentMessage: Option.Option<Message> = Option.none()
		try {
			while (!isTerminal(phase)) {
				const entry = MutableList.take(pendingMessages)
				if (entry === MutableList.Empty) return
				currentMessage = Option.some(entry.message)
				processMessage(entry)

				if (entry === until) {
					if (pendingMessages.length > 0) scheduleDeferredDrain()
					return
				}
				if (
					until === undefined &&
					pendingMessages.length > 0 &&
					syncWorkMsSinceYield + (performance.now() - drainStartedAt) > DRAIN_BUDGET_MS
				) {
					scheduleDeferredDrain()
					return
				}
			}
		} catch (error) {
			crashWith(Cause.die(error), currentMessage)
		} finally {
			const drainEndedAt = performance.now()
			syncWorkMsSinceYield += drainEndedAt - drainStartedAt
			lastDrainEndedAt = drainEndedAt
			if (phase._tag === "Live" && phase.drain === "Sync") {
				phase = {
					_tag: "Live",
					drain: "Idle",
				}
			}
		}
	}

	function canCommit(): Result.Result<void, CommitError> {
		switch (phase._tag) {
			case "Booting":
				return Result.fail(
					new CommitError({
						details: {
							reason: "Inactive",
						},
					})
				)
			case "Crashed":
				return Result.fail(
					new CommitError({
						details: {
							reason: "Crashed",
							cause: phase.cause,
						},
					})
				)
			case "Disposed":
				return Result.fail(
					new CommitError({
						details: {
							reason: "Disposed",
						},
					})
				)
			case "Live":
				return phase.drain === "Sync"
					? Result.fail(
							new CommitError({
								details: {
									reason: "Reentrant",
								},
							})
						)
					: Result.void
		}
	}

	const commit = (message: Message): Result.Result<void, CommitError> =>
		Result.flatMap(canCommit(), function () {
			const entry = { message }
			MutableList.append(pendingMessages, entry)
			cancelDeferredDrain()
			phase = {
				_tag: "Live",
				drain: "Idle",
			}
			drainPendingMessages(entry)
			return canCommit()
		})

	function subscribe(listener: () => void): () => void {
		listeners.add(listener)
		return function () {
			listeners.delete(listener)
		}
	}

	const disposal = Deferred.makeUnsafe<void>()
	const dispose = (exit: Exit.Exit<unknown, unknown> = Exit.void): Effect.Effect<void> =>
		Effect.uninterruptibleMask((restore) =>
			Effect.suspend(function () {
				if (phase._tag === "Disposed") return restore(Deferred.await(disposal))
				phase = {
					_tag: "Disposed",
					crash: getCrash(),
				}
				const notify = [...listeners]
				return Effect.sync(function () {
					MutableList.clear(pendingMessages)
					listeners.clear()
					crashListeners.clear()
					cancelDeferredDrain()
				}).pipe(
					Effect.andThen(Effect.forEach(notify, (listener) => Effect.exit(Effect.sync(listener)))),
					Effect.flatMap(function (exits) {
						const result = Exit.asVoidAll(exits)
						return Exit.isFailure(result) ? Effect.failCause(result.cause) : Effect.void
					}),
					Effect.ensuring(closeResources(exit)),
					Effect.onExit((result) => Deferred.done(disposal, result))
				)
			})
		)

	// Foldkit: attach subscriptions before lifting the boot barrier so their
	// init deps see the init Model, then fork init Commands, then go Live.
	forkSubscriptionFibers(config.subscriptions, {
		bootModel: initialModel,
		modelPubSub,
		fiberScope,
		runtimeContext,
		provideAllResources,
		enqueueMessage,
		crashWith,
	})

	if (initCommands.length > 0) {
		for (const command of initCommands) forkCommand(command, Option.none())
	}

	if (!isTerminal(phase)) {
		phase = {
			_tag: "Live",
			drain: "Idle",
		}
		drainPendingMessages()
	}

	return {
		[StoreTypeId]: StoreTypeId,
		getModel: () => model,
		getCrash,
		subscribeCrash(listener) {
			crashListeners.add(listener)
			return function () {
				crashListeners.delete(listener)
			}
		},
		subscribe,
		dispatch: enqueueMessage,
		commit,
		dispose,
		isDisposed: () => phase._tag === "Disposed",
	} satisfies Store<Model, Message>
}
