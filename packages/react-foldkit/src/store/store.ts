import {
	Array,
	Cause,
	Context,
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
import { CurrentInterruptRegistry, makeInterruptRegistry } from "../internal/interrupt"
import type * as ManagedResource from "foldkit/managedResource"
import type { ManagedResourceRecord, HostServices, RequireManagedRecord } from "../internal/managedResource"
import { makeManagedResources } from "./managedResources"
import type * as Subscription from "foldkit/subscription"
import type * as Update from "foldkit/update"
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
export type Program<
	Model,
	Message,
	R = never,
	Managed extends ManagedResource.ManagedResources<Model, Message> = {},
> = {
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
	 * the failure. Runs before `subscribeCrash` listeners. Observer defects are logged.
	 */
	onCrash?: (cause: Cause.Cause<unknown>, triggeringMessage: Option.Option<Message>) => void
	/**
	 * Resources whose lifetime follows the Model. Use Foldkit's `ManagedResource.make` to declare
	 * acquisition, release, and lifecycle Messages. Each activation owns separate live values.
	 * A record supplies a service only when its known entries guarantee that tag in every alternative.
	 */
	managedResources?: ManagedResourceRecord<Model, Message, Managed>
} & RequireManagedRecord<ManagedResourceRecord<Model, Message, Managed>>

/**
 * A Program with a Layer that provides the services its Commands and Subscriptions need.
 * Use this configuration with React or `boot`, where there is no surrounding Effect Context
 * to supply those services.
 *
 * The Layer must require no additional services and have no typed failures. It is optional
 * when Managed Resources supply all services or the Program requires none. The Store builds
 * it when live work first needs it.
 *
 * @see {@link make} for running a Program with services from an Effect host
 * @category configuration
 * @since 0.1.0
 */
export type Config<Model, Message, R = never, Managed extends ManagedResource.ManagedResources<Model, Message> = {}> = [
	HostServices<R, Managed>,
] extends [never]
	? Program<Model, Message, R, Managed> & {
			/**
			 * Supplies services not provided by Managed Resources. Live work finishes before the Layer
			 * releases its resources.
			 */
			resources?: Layer.Layer<never, never, never>
		}
	: Program<Model, Message, R, Managed> & {
			/**
			 * Supplies services not provided by Managed Resources. Live work finishes before the Layer
			 * releases its resources.
			 */
			resources: Layer.Layer<NoInfer<HostServices<R, Managed>>, never, never>
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
	/**
	 * Lists the Commands that have started and not yet finished, in start order. Disposal
	 * interrupts these Commands. Their services are unknown outside the Program that returned them.
	 */
	getRunningCommands: () => Update.Commands<Message, unknown>
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
 * The `CommitError` reason when React has deactivated the Provider that owns the Store.
 *
 * @see {@link CommitError} for the failure that carries it
 * @category errors
 * @since 0.1.0
 */
export class Inactive extends Schema.Error<Inactive>("react-foldkit/Store/Inactive")({
	_tag: Schema.tag("Inactive"),
}) {}

/**
 * The `CommitError` reason when `commit` is called while the Store is already delivering a
 * Message, such as from a Model listener.
 *
 * @see {@link CommitError} for the failure that carries it
 * @category errors
 * @since 0.1.0
 */
export class Reentrant extends Schema.Error<Reentrant>("react-foldkit/Store/Reentrant")({
	_tag: Schema.tag("Reentrant"),
}) {}

/**
 * A Message delivery failure returned by `commit`.
 * `reason` is `Inactive`, `Reentrant`, `Disposed`, or `Crashed`; a `Crashed` reason carries the
 * original crash Cause. Handle one reason with `Effect.catchReason("CommitError", "Inactive", ...)`.
 *
 * A failure does not undo Model changes already applied while processing Messages.
 *
 * @see {@link commit} for sending a Message from an Effect
 * @category errors
 * @since 0.1.0
 */
export class CommitError extends Schema.Error<CommitError>("react-foldkit/Store/CommitError")({
	_tag: Schema.tag("CommitError"),
	reason: Schema.Union([Inactive, Reentrant, Disposed, Crashed]),
}) {
	get message(): string {
		return "Cannot commit: store is " + this.reason._tag.toLowerCase()
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
 * changes and checks again. It removes its listeners on completion or interruption. When a
 * later Model matches, the Effect continues after the Store finishes delivering the Message
 * that produced it, so the caller can `commit` right away.
 *
 * A crashed Store fails with `Crashed`; a disposed Store fails with `Disposed`. These failures
 * take priority even if the last Model matches. Exceptions from the selector become defects.
 *
 * **Example** (Waiting for a loaded project title)
 *
 * ```ts
 * import { Effect, Option, Schema } from "effect"
 * import { defineMessageUnion } from "foldkit/message"
 * import * as Store from "react-foldkit/store"
 * import { modifyFields } from "foldkit/struct"
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
		// Listeners run inside the Store's delivery. Resuming there would make the caller's next
		// commit reentrant, so a match found by a listener continues after a yield.
		function check(fromListener: boolean): void {
			if (settled) return
			function settle(effect: Effect.Effect<A, Disposed | Crashed>): void {
				settled = true
				cleanup()
				resume(fromListener ? Effect.andThen(Effect.yieldNow, effect) : effect)
			}
			const crash = store.getCrash()
			const result: Exit.Exit<Option.Option<A>, Disposed | Crashed> = Option.isSome(crash)
				? Exit.fail(
						new Crashed({
							cause: crash.value,
						})
					)
				: store.isDisposed()
					? Exit.fail(new Disposed())
					: Result.match(
							Result.try(() => pick(store.getModel())),
							{ onSuccess: Exit.succeed, onFailure: Exit.die }
						)
			if (Exit.isFailure(result)) settle(Effect.failCause(result.cause))
			else if (Option.isSome(result.value)) settle(Effect.succeed(result.value.value))
		}
		check(false)
		if (settled) return
		unsubscribeModel = store.subscribe(() => check(true))
		unsubscribeCrash = store.subscribeCrash(() => check(true))
		// A synchronous subscription may settle before it returns its cleanup handle.
		if (settled) cleanup()
		return Effect.sync(cleanup)
	})
)

const DRAIN_BUDGET_MS = 5

/** Messages kept while the Store is inactive before the oldest are dropped. */
const MAX_INACTIVE_MESSAGES = 1000

type Command<Message, R> = Update.Commands<Message, R>[number]

interface PendingMessage<Message, R> {
	readonly message: Message
	/** The Command whose result this is. Its delivery completes a tracked init Command. */
	readonly command?: Command<Message, R>
}

interface Crash<Message> {
	readonly cause: Cause.Cause<unknown>
	/** The Message whose update or Command crashed the Store. */
	readonly message: Option.Option<Message>
}

/**
 * The live work of one activation: Command and Subscription fibers, the services they use, and
 * the Model feed for Subscriptions.
 */
interface Activation<Model, R> {
	readonly runtimeContext: Context.Context<never>
	readonly fiberScope: Scope.Scope
	readonly modelPubSub: PubSub.PubSub<Model>
	readonly provideServices: <A, E>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E>
	/** Stops the fibers, then releases the services. The first Exit passed here wins. */
	readonly close: (exit: Exit.Exit<unknown, unknown>) => Effect.Effect<void>
}

type Phase<Model, Message, R> =
	| { readonly _tag: "Inactive"; readonly crash: Option.Option<Crash<Message>> }
	| {
			readonly _tag: "Live"
			readonly activation: Activation<Model, R>
			readonly drain: "Idle" | "Sync" | "Deferred"
	  }
	| { readonly _tag: "Crashed"; readonly activation: Activation<Model, R>; readonly crash: Crash<Message> }
	| { readonly _tag: "Disposed"; readonly crash: Option.Option<Crash<Message>> }

/**
 * Options for one activation of a Runtime.
 */
export interface ActivateOptions<Message, R> {
	/**
	 * The activating fiber's Context. Commands and Subscriptions run with it, and it supplies their
	 * services when the Program has no `resources` Layer.
	 */
	readonly context: Context.Context<never>
	readonly commands: Update.Commands<Message, R>
	/** Delivered before the Messages that were queued while the Store was inactive. */
	readonly firstMessage: Option.Option<Message>
}

/**
 * A Store that can stop and restart its live work. It keeps its Model, queue, and listeners
 * across activations. Each activation owns the Command and Subscription fibers and the services
 * they use, and ends when the Scope passed to `activate` closes. A crash is terminal for the
 * activation, and the next activation clears it.
 */
export type Runtime<Model, Message, R> = Omit<Store<Model, Message>, "getRunningCommands" | "dispose"> & {
	readonly activate: (options: ActivateOptions<Message, R>) => Effect.Effect<void, never, Scope.Scope>
	readonly getCrashMessage: () => Option.Option<Message>
	readonly getRunningCommands: () => Update.Commands<Message, R>
	/** Like `Store.dispose`, and resource finalizers receive `exit` unless a crash closed them first. */
	readonly dispose: (exit?: Exit.Exit<unknown, unknown>) => Effect.Effect<void>
}

export interface RuntimeObserver<Model, Message, R> {
	readonly recordInit: (model: Model, commands: Update.Commands<Message, R>) => void
	readonly recordMessage: (
		message: Message,
		modelBeforeUpdate: Model,
		modelAfterUpdate: Model,
		commands: Update.Commands<Message, R>
	) => void
	/** Returns the Command the Store should fork. DevTools uses this to keep history ids on that Command. */
	readonly adoptCommand: (command: Update.Commands<Message, R>[number]) => Update.Commands<Message, R>[number]
}

export function makeRuntime<Model, Message, R, Managed extends ManagedResource.ManagedResources<Model, Message>>(
	program: Config<Model, Message, R, Managed>,
	initialModel: Model,
	observer?: RuntimeObserver<Model, Message, R>
): Runtime<Model, Message, R>
export function makeRuntime<Model, Message, R, Managed extends ManagedResource.ManagedResources<Model, Message>>(
	program: Program<Model, Message, R, Managed> & {
		readonly resources?: Layer.Layer<NoInfer<HostServices<R, Managed>>, never, never>
	},
	initialModel: Model,
	observer?: RuntimeObserver<Model, Message, R>
): Runtime<Model, Message, R>
export function makeRuntime<Model, Message, R, Managed extends ManagedResource.ManagedResources<Model, Message>>(
	program: Program<Model, Message, R, Managed> & {
		readonly resources?: Layer.Layer<NoInfer<HostServices<R, Managed>>, never, never>
	},
	initialModel: Model,
	observer?: RuntimeObserver<Model, Message, R>
): Runtime<Model, Message, R> {
	const listeners = new Set<() => void>()
	const crashListeners = new Set<() => void>()
	const pendingMessages = MutableList.make<PendingMessage<Message, R>>()
	const runningCommands = new Map<Fiber.Fiber<void>, Command<Message, R>>()
	let model = initialModel
	let phase: Phase<Model, Message, R> = { _tag: "Inactive", crash: Option.none() }
	let syncWorkMsSinceYield = 0
	let lastDrainEndedAt = 0
	let deferredDrainChannel: MessageChannel | undefined
	let warnedInactiveOverflow = false
	let hasRecordedInit = false

	function observe<A>(run: () => A): A | undefined {
		try {
			return run()
		} catch (error) {
			runFork(Effect.logError(Cause.die(error)))
			return undefined
		}
	}

	// Logs with the live activation's services, such as its Logger, when there is one.
	function runFork(effect: Effect.Effect<void>): void {
		const context =
			phase._tag === "Live" || phase._tag === "Crashed" ? phase.activation.runtimeContext : Context.empty()
		Effect.runForkWith(context)(effect)
	}

	// Observers run synchronously and in order. A throwing observer is logged and the rest still run.
	function notify(observers: Iterable<() => void>): void {
		for (const observer of Array.fromIterable(observers)) {
			const notified = Result.try(observer)
			if (Result.isFailure(notified)) runFork(Effect.logError(Cause.die(notified.failure)))
		}
	}

	function currentCrash(): Option.Option<Crash<Message>> {
		switch (phase._tag) {
			case "Live":
				return Option.none()
			case "Crashed":
				return Option.some(phase.crash)
			case "Inactive":
			case "Disposed":
				return phase.crash
		}
	}

	function crashWith(cause: Cause.Cause<unknown>, message: Option.Option<Message>): void {
		if (phase._tag !== "Live") return
		const { activation } = phase
		phase = { _tag: "Crashed", activation, crash: { cause, message } }
		runFork(activation.close(Exit.failCause(cause)).pipe(Effect.catchCause(Effect.logError)))
		// onCrash runs first so crash listeners observe everything it records.
		if (program.onCrash === undefined)
			runFork(Effect.logError("[react-foldkit] Store crashed:", Cause.pretty(cause)))
		else notify([() => program.onCrash?.(cause, message)])
		notify(crashListeners)
	}

	function enqueueMessage(message: Message, command?: Command<Message, R>): void {
		switch (phase._tag) {
			case "Live":
				MutableList.append(pendingMessages, { message, command })
				drainPendingMessages()
				return
			case "Inactive":
				queueWhileInactive(message)
				return
			case "Crashed":
			case "Disposed":
				return
		}
	}

	// Holds Messages sent while React has deactivated the Provider until the next activation.
	function queueWhileInactive(message: Message): void {
		MutableList.append(pendingMessages, { message })
		if (pendingMessages.length <= MAX_INACTIVE_MESSAGES) return
		MutableList.take(pendingMessages)
		if (warnedInactiveOverflow) return
		warnedInactiveOverflow = true
		runFork(
			Effect.logWarning(
				`[react-foldkit] Dropping Messages dispatched while the Provider is inactive; more than ${MAX_INACTIVE_MESSAGES} are waiting.`
			)
		)
	}

	function cancelDeferredDrain(): void {
		if (deferredDrainChannel === undefined) return
		deferredDrainChannel.port1.close()
		deferredDrainChannel.port2.close()
		deferredDrainChannel = undefined
	}

	function scheduleDeferredDrain(): void {
		if (phase._tag !== "Live" || phase.drain === "Deferred") return
		if (deferredDrainChannel === undefined) {
			const channel = new MessageChannel()
			deferredDrainChannel = channel
			channel.port2.onmessage = function () {
				// A commit can overtake this task and replace its channel.
				if (deferredDrainChannel !== channel || phase._tag !== "Live" || phase.drain !== "Deferred") return
				phase = { ...phase, drain: "Idle" }
				syncWorkMsSinceYield = 0
				drainPendingMessages()
			}
		}
		phase = { ...phase, drain: "Deferred" }
		deferredDrainChannel.port1.postMessage(null)
	}

	const isLive = (activation: Activation<Model, R>): boolean =>
		phase._tag === "Live" && phase.activation === activation

	// Forks the Command into the activation's fiber Scope. The fiber inherits the calling fiber's
	// Context, so run this with the activation's Context.
	const adopted = (command: Command<Message, R>): Command<Message, R> =>
		observe(() => observer?.adoptCommand(command)) ?? command

	function startCommand(
		activation: Activation<Model, R>,
		command: Command<Message, R>,
		triggeringMessage: Option.Option<Message>
	): Effect.Effect<void> {
		// Foldkit Command accepts a Schema or its Type; this runtime dispatches values.
		const effect = (command.effect as Effect.Effect<Message, never, R>).pipe(
			Effect.withSpan(command.name, { attributes: command.args ?? {} }),
			activation.provideServices,
			Effect.flatMap((message) =>
				Effect.sync(function () {
					// A result that lands after its activation ended belongs to no Store.
					if (isLive(activation)) enqueueMessage(message, command)
				})
			),
			Effect.catchCause((cause) =>
				Effect.sync(function () {
					if (isLive(activation)) crashWith(cause, triggeringMessage)
				})
			)
		)
		// Each start gets its own entry, listed from the moment it is forked. A Command forked and
		// stopped in the same tick still counts as interrupted.
		return Effect.forkIn(effect, activation.fiberScope).pipe(
			Effect.flatMap((fiber) =>
				Effect.sync(function () {
					runningCommands.set(fiber, command)
					fiber.addObserver(() => runningCommands.delete(fiber))
				})
			)
		)
	}

	// update runs outside any fiber, so a Command it returns starts on a new one.
	function forkCommand(
		activation: Activation<Model, R>,
		command: Command<Message, R>,
		triggeringMessage: Option.Option<Message>
	): void {
		Effect.runForkWith(activation.runtimeContext)(startCommand(activation, adopted(command), triggeringMessage))
	}

	function processMessage(activation: Activation<Model, R>, { message, command }: PendingMessage<Message, R>): void {
		const updated = Result.try(() => program.update(model, message))
		if (Result.isFailure(updated)) return crashWith(Cause.die(updated.failure), Option.some(message))
		const previous = model
		model = updated.success.model
		const commands = updated.success.commands ?? []
		observe(() => observer?.recordMessage(message, previous, model, commands))
		if (command !== undefined) InitCommand.complete(command)
		if (previous !== model) {
			PubSub.publishUnsafe(activation.modelPubSub, model)
			notify(listeners)
		}
		for (const next of commands) forkCommand(activation, next, Option.some(message))
	}

	function drainPendingMessages(until?: PendingMessage<Message, R>): void {
		if (phase._tag !== "Live" || phase.drain !== "Idle") return
		const { activation } = phase

		const drainStartedAt = performance.now()
		if (drainStartedAt - lastDrainEndedAt > DRAIN_BUDGET_MS) syncWorkMsSinceYield = 0

		if (until === undefined && syncWorkMsSinceYield > DRAIN_BUDGET_MS) {
			scheduleDeferredDrain()
			return
		}

		phase = { ...phase, drain: "Sync" }
		processUntilYield(activation, drainStartedAt, until)
		const drainEndedAt = performance.now()
		syncWorkMsSinceYield += drainEndedAt - drainStartedAt
		lastDrainEndedAt = drainEndedAt
		if (phase._tag === "Live" && phase.drain === "Sync") phase = { ...phase, drain: "Idle" }
	}

	// Processes queued Messages until the queue empties, `until` is processed, the activation
	// ends, or the budget runs out. The last two cases defer the rest to a later task.
	function processUntilYield(
		activation: Activation<Model, R>,
		drainStartedAt: number,
		until: PendingMessage<Message, R> | undefined
	): void {
		while (isLive(activation)) {
			const entry = MutableList.take(pendingMessages)
			if (entry === MutableList.Empty) return
			processMessage(activation, entry)

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
	}

	function canCommit(): Result.Result<void, CommitError> {
		switch (phase._tag) {
			case "Inactive":
				return Result.fail(new CommitError({ reason: new Inactive() }))
			case "Crashed":
				return Result.fail(new CommitError({ reason: new Crashed({ cause: phase.crash.cause }) }))
			case "Disposed":
				return Result.fail(new CommitError({ reason: new Disposed() }))
			case "Live":
				return phase.drain === "Sync" ? Result.fail(new CommitError({ reason: new Reentrant() })) : Result.void
		}
	}

	const commit = (message: Message): Result.Result<void, CommitError> =>
		Result.flatMap(canCommit(), function () {
			if (phase._tag !== "Live") return canCommit()
			const entry: PendingMessage<Message, R> = { message }
			MutableList.append(pendingMessages, entry)
			cancelDeferredDrain()
			phase = { ...phase, drain: "Idle" }
			drainPendingMessages(entry)
			return canCommit()
		})

	const activate = ({
		context,
		commands,
		firstMessage,
	}: ActivateOptions<Message, R>): Effect.Effect<void, never, Scope.Scope> =>
		Effect.gen(function* () {
			if (phase._tag !== "Inactive")
				return yield* Effect.die(new Error("[react-foldkit] Store is already active"))
			const scope = yield* Scope.Scope
			const work = yield* Scope.fork(scope, "sequential")
			// Close in reverse order: live work, Managed Resources, then static services.
			const layerScope = yield* Scope.fork(work)
			const managedScope = yield* Scope.fork(work, "parallel")
			const managed = yield* makeManagedResources<Model, Message, Managed>(program.managedResources)
			const fiberScope = yield* Scope.fork(work, "parallel")
			const layer = program.resources
			const build = yield* Effect.cached(
				Effect.forkIn(
					layer === undefined
						? // Without a Layer, the overloads of `make` require the caller's Context to supply the remaining services.
							Effect.succeed(context as Context.Context<HostServices<R, Managed>>)
						: Layer.buildWithScope(layer, layerScope),
					layerScope,
					{ uninterruptible: false }
				).pipe(Effect.uninterruptible)
			)
			const services = Effect.flatMap(build, Fiber.join)
			const interruptRegistry = makeInterruptRegistry()
			let closingExit: Exit.Exit<unknown, unknown> | undefined
			const closed = yield* Effect.cached(Effect.suspend(() => Scope.close(work, closingExit ?? Exit.void)))
			const activation: Activation<Model, R> = {
				runtimeContext: Context.add(context, Scheduler.Scheduler, browserScheduler),
				fiberScope,
				modelPubSub: yield* PubSub.unbounded<Model>(),
				provideServices: (effect) =>
					Effect.flatMap(services, (services) =>
						Effect.provideService(
							Effect.provideContext(Effect.provideContext(effect, managed.context), services),
							CurrentInterruptRegistry,
							interruptRegistry
						)
					),
				close: (exit) =>
					Effect.suspend(function () {
						closingExit ??= exit
						return closed
					}),
			}
			yield* Scope.addFinalizerExit(scope, (exit) =>
				Effect.suspend(function () {
					if ((phase._tag === "Live" || phase._tag === "Crashed") && phase.activation === activation) {
						phase = { _tag: "Inactive", crash: currentCrash() }
						cancelDeferredDrain()
					}
					return activation.close(exit)
				})
			)
			phase = { _tag: "Live", activation, drain: "Idle" }
			// The host yielded while the Store was inactive, so the drain budget starts over.
			syncWorkMsSinceYield = 0
			// Activation clears any earlier crash. Crash listeners read the new health.
			notify(crashListeners)

			// Foldkit attaches subscriptions before forking init Commands, so their initial
			// dependencies come from the current Model.
			yield* Effect.gen(function* () {
				if (!hasRecordedInit) {
					observe(() => observer?.recordInit(model, commands))
					hasRecordedInit = true
				}
				yield* forkSubscriptionFibers(program.subscriptions, {
					initialModel: model,
					modelPubSub: activation.modelPubSub,
					fiberScope,
					provideServices: activation.provideServices,
					deliver(message) {
						if (isLive(activation)) enqueueMessage(message)
					},
					crash(cause, message) {
						if (isLive(activation)) crashWith(cause, message)
					},
				})
				yield* managed.start({
					initialModel: model,
					modelPubSub: activation.modelPubSub,
					scope: managedScope,
					deliver(message) {
						if (isLive(activation)) enqueueMessage(message)
					},
					crash(cause, message) {
						if (isLive(activation)) crashWith(cause, message)
					},
				})
				for (const command of commands) yield* startCommand(activation, adopted(command), Option.none())
			}).pipe(Effect.provideContext(activation.runtimeContext))

			if (Option.isNone(firstMessage)) return drainPendingMessages()
			// The first Message and every Message queued while inactive arrive before activate returns.
			const backlog = Array.prepend(MutableList.takeAll(pendingMessages), { message: firstMessage.value })
			MutableList.appendAll(pendingMessages, backlog)
			drainPendingMessages(Array.lastNonEmpty(backlog))
		})

	let disposeExit: Exit.Exit<unknown, unknown> | undefined
	const disposeOnce = Effect.runSync(
		Effect.cached(
			Effect.suspend(function () {
				const activation = phase._tag === "Live" || phase._tag === "Crashed" ? phase.activation : undefined
				phase = { _tag: "Disposed", crash: currentCrash() }
				MutableList.clear(pendingMessages)
				cancelDeferredDrain()
				return Effect.forEach(Array.fromIterable(listeners), (listener) =>
					Effect.exit(Effect.sync(listener))
				).pipe(
					Effect.flatMap(Exit.asVoidAll),
					Effect.ensuring(
						Effect.suspend(() =>
							activation === undefined ? Effect.void : activation.close(disposeExit ?? Exit.void)
						)
					)
				)
			}).pipe(Effect.uninterruptible)
		)
	)

	return {
		[StoreTypeId]: StoreTypeId,
		getModel: () => model,
		getCrash: () => Option.map(currentCrash(), (crash) => crash.cause),
		getCrashMessage: () => Option.flatMap(currentCrash(), (crash) => crash.message),
		subscribeCrash: (listener) => subscribeTo(crashListeners, listener),
		subscribe: (listener) => subscribeTo(listeners, listener),
		dispatch: (message) => enqueueMessage(message),
		commit,
		dispose: (exit = Exit.void) =>
			Effect.suspend(function () {
				disposeExit ??= exit
				return disposeOnce
			}),
		isDisposed: () => phase._tag === "Disposed",
		getRunningCommands: () => Array.fromIterable(runningCommands.values()),
		activate,
	}
}

function subscribeTo(listeners: Set<() => void>, listener: () => void): () => void {
	listeners.add(listener)
	return function () {
		listeners.delete(listener)
	}
}

/**
 * Creates a Store managed by an Effect Scope.
 * Use it in `Effect.scoped` or another scoped Effect so cleanup runs when that work ends.
 *
 * Closing the Scope stops Commands and Subscriptions before releasing their services. Without
 * `resources`, the Store uses services from the calling Effect's Context. A supplied Layer is
 * built when live work first needs it.
 *
 * **Example** (Sending a Message and reading the updated Model)
 *
 * ```ts
 * import { Effect } from "effect"
 * import { defineMessageUnion } from "foldkit/message"
 * import * as Store from "react-foldkit/store"
 * import { modifyFields } from "foldkit/struct"
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
export function make<Model, Message, R = never, Managed extends ManagedResource.ManagedResources<Model, Message> = {}>(
	config: Config<Model, Message, R, Managed>,
	init: Update.Return<Model, Message, R>
): Effect.Effect<Store<Model, Message>, never, Scope.Scope>
export function make<Model, Message, R = never, Managed extends ManagedResource.ManagedResources<Model, Message> = {}>(
	config: Program<Model, Message, R, Managed> & { readonly resources?: never },
	init: Update.Return<Model, Message, R>
): Effect.Effect<Store<Model, Message>, never, HostServices<R, Managed> | Scope.Scope>
// eslint-disable-next-line foldkit-style/prefer-arrow-for-expression-return -- Overloads distinguish provided and ambient services.
export function make<Model, Message, R = never, Managed extends ManagedResource.ManagedResources<Model, Message> = {}>(
	config: Program<Model, Message, R, Managed> & {
		readonly resources?: Layer.Layer<NoInfer<HostServices<R, Managed>>, never, never>
	},
	init: Update.Return<Model, Message, R>
): Effect.Effect<Store<Model, Message>, never, HostServices<R, Managed> | Scope.Scope> {
	return Effect.gen(function* () {
		const runtime = makeRuntime(config, init.model)
		yield* runtime.activate({
			context: yield* Effect.context<HostServices<R, Managed>>(),
			commands: init.commands ?? [],
			firstMessage: Option.none(),
		})
		// Runs before the activation's finalizer, so disposal sets the Exit resources receive.
		yield* Effect.addFinalizer((exit) => runtime.dispose(exit))
		return runtime
	})
}

/**
 * Creates a Store synchronously, with cleanup managed by the caller.
 * Use it when the host creates the Store outside a scoped Effect. Run `store.dispose()` when
 * the host no longer needs it, including when the host's work fails.
 *
 * Provide required services through `config.resources`. Unlike `make`, `boot` cannot receive
 * services from a surrounding Effect Context.
 *
 * **Example** (Using a Store with explicit cleanup)
 *
 * ```ts
 * import { Effect, Result } from "effect"
 * import { defineMessageUnion } from "foldkit/message"
 * import * as Store from "react-foldkit/store"
 * import { modifyFields } from "foldkit/struct"
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
export function boot<Model, Message, R = never, Managed extends ManagedResource.ManagedResources<Model, Message> = {}>(
	config: Config<Model, Message, R, Managed>,
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
