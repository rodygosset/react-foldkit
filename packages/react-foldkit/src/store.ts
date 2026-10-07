import {
	Cause,
	Context,
	Deferred,
	Effect,
	Exit,
	Fiber,
	Layer,
	MutableList,
	Option,
	PubSub,
	Record,
	Ref,
	Result,
	Scheduler,
	Schema,
	Scope,
	Stream,
} from "effect"
import * as InitCommand from "./internal/init-command"
import { CurrentInterruptRegistry, type InterruptRegistry, makeInterruptRegistry } from "./internal/interrupt"
import type * as Subscription from "./subscription"
import type * as Update from "./update"

type ConfigBase<Model, Message, R> = {
	/** Pure Model transition. Return Commands for side effects. Bootstrap may call update during render. */
	update: (model: Model, message: Message) => Update.Return<Model, Message, R>
	/**
	 * Model-gated standing orders. Each entry restarts its Stream when
	 * dependencies change (Foldkit Subscription contract).
	 */
	subscriptions?: Subscription.Subscriptions<Model, Message, R>
	/**
	 * Called once when update throws or a Command fiber fails. After crash the
	 * store stops processing Messages (Foldkit crash-terminality).
	 */
	onCrash?: (cause: Cause.Cause<unknown>, triggeringMessage: Option.Option<Message>) => void
}

/**
 * Program definition: update + services. Init is supplied later via {@link make} or {@link boot}.
 *
 * When `R` is `never`, `layer` is optional (defaults to {@link Layer.empty}).
 * When `R` is not `never`, `layer` is required so Command Effects can be provided.
 * `NoInfer` keeps `R` pinned to `update` / `subscriptions`, so `Layer.empty`
 * cannot satisfy a config that requires services.
 */
export type Config<Model, Message, R = never> = [R] extends [never]
	? ConfigBase<Model, Message, R> & {
			layer?: Layer.Layer<never, never, never>
		}
	: ConfigBase<Model, Message, R> & {
			layer: Layer.Layer<NoInfer<R>, never, never>
		}

export const StoreTypeId: unique symbol = Symbol.for("react-foldkit/StoreTypeId")
export type StoreTypeId = typeof StoreTypeId

export type Store<Model, Message> = Readonly<{
	[StoreTypeId]: StoreTypeId
	getModel: () => Model
	/** Terminal crash Cause, retained after disposal. */
	getCrash: () => Option.Option<Cause.Cause<unknown>>
	/** Crash invalidation only. Read getCrash for current health; registration does not replay. */
	subscribeCrash: (listener: () => void) => () => void
	subscribe: (listener: () => void) => () => void
	dispatch: (message: Message) => void
	/** Processes through this Message synchronously, preserving FIFO and asynchronous Commands. */
	commit: (message: Message) => Result.Result<void, CommitError>
	/** Releases resources once. Concurrent and later callers await the same cleanup result. */
	dispose: () => Effect.Effect<void>
	isDisposed: () => boolean
}>

/** Failed {@link takeWhen} because {@link Store.dispose} ran first. */
export class Disposed extends Schema.Error<Disposed>("react-foldkit/Store/Disposed")({
	_tag: Schema.tag("Disposed"),
}) {}

/** A synchronous commit could not complete. A crashed store preserves its Cause. */
export class CommitError extends Schema.Error<CommitError>("react-foldkit/Store/CommitError")({
	_tag: Schema.tag("CommitError"),
	reason: Schema.Literals(["Inactive", "Reentrant", "Crashed", "Disposed"]),
	cause: Schema.optional(Schema.Cause(Schema.Unknown, Schema.Unknown)),
}) {
	get message(): string {
		return "Cannot commit: store is " + this.reason.toLowerCase()
	}
}

/** Lazily commits through the synchronous queue, exposing delivery failure in the Effect error channel. */
export const commit = <Model, Message>(
	store: Store<Model, Message>,
	message: NoInfer<Message>
): Effect.Effect<void, CommitError> => Effect.suspend(() => Effect.fromResult(store.commit(message)))

/**
 * Succeeds with the first Model for which `pick` returns `Option.some`.
 * Fails with {@link Disposed} if the store is disposed first.
 * Interrupting the Effect unsubscribes.
 */
export const takeWhen = <Model, Message, A>(
	store: Store<Model, Message>,
	pick: (model: Model) => Option.Option<A>
): Effect.Effect<A, Disposed> =>
	Effect.callback<A, Disposed>(function (resume) {
		let isSettled = false

		function tryPick(): boolean {
			if (isSettled) return true

			if (store.isDisposed()) {
				isSettled = true
				resume(Effect.fail(new Disposed()))
				return true
			}

			const maybeValue = pick(store.getModel())
			if (Option.isSome(maybeValue)) {
				isSettled = true
				resume(Effect.succeed(maybeValue.value))
				return true
			}

			return false
		}

		if (tryPick()) return

		const unsubscribe = store.subscribe(function () {
			if (tryPick()) {
				unsubscribe()
			}
		})

		return Effect.sync(function () {
			unsubscribe()
		})
	})

/** Sync drain yields to the browser after this much cumulative work (Foldkit). */
const DRAIN_BUDGET_MS = 5

/**
 * Single lifecycle + drain state machine. Drain modes only apply while `Live`.
 */
type Phase =
	| { readonly _tag: "Booting" }
	| { readonly _tag: "Live"; readonly drain: "Idle" | "Sync" | "Deferred" }
	| { readonly _tag: "Crashed"; readonly cause: Cause.Cause<unknown> }
	| { readonly _tag: "Disposed"; readonly crash: Option.Option<Cause.Cause<unknown>> }

const isTerminal = (phase: Phase): boolean => phase._tag === "Crashed" || phase._tag === "Disposed"

const canEnterDrain = (phase: Phase): boolean => phase._tag === "Live" && phase.drain === "Idle"

function resolveLayer<R>(layer: Layer.Layer<R, never, never> | undefined): Layer.Layer<R, never, never> {
	if (layer !== undefined) return layer
	return Layer.empty as Layer.Layer<R, never, never>
}

/**
 * Foldkit browser scheduling: default `setTimeout(0)` is clamped to ≥4ms in
 * browsers. Command / Subscription fiber yields use this microtask scheduler
 * instead so results land on the next tick.
 */
function microtaskSetImmediate(callback: () => void): () => void {
	let cancelled = false
	queueMicrotask(function () {
		if (!cancelled) callback()
	})
	return function () {
		cancelled = true
	}
}

const browserScheduler = new Scheduler.MixedScheduler("async", microtaskSetImmediate)

const runtimeContextForCommands: Context.Context<never> = Context.make(Scheduler.Scheduler, browserScheduler)

const makeProvideAllResources =
	<R>(
		acquireResourceContext: Effect.Effect<Context.Context<R>>,
		interruptRegistry: InterruptRegistry
	): (<A, E>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E>) =>
	<A, E>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E> =>
		Effect.flatMap(acquireResourceContext, (ctx) =>
			Effect.provideService(Effect.provideContext(effect, ctx), CurrentInterruptRegistry, interruptRegistry)
		)

type SubscriptionRuntime<Model, Message, R> = {
	readonly bootModel: Model
	readonly modelPubSub: PubSub.PubSub<Model>
	readonly storeScope: Scope.Scope
	readonly runtimeContextForCommands: Context.Context<never>
	readonly provideAllResources: <A, E>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E>
	readonly enqueueMessage: (message: Message) => void
	readonly crashWith: (cause: Cause.Cause<unknown>, triggeringMessage: Option.Option<Message>) => void
}

/**
 * Forks one fiber per subscription entry. Seeds deps with a boot-time snapshot
 * via `Stream.concat` (Foldkit), then follows PubSub model changes. Ref updates
 * run upstream of `changesWith` so `readDependencies` stays current even when
 * equivalence filters drop an emission.
 */
function forkSubscriptionFibers<Model, Message, R>(
	subscriptions: Subscription.Subscriptions<Model, Message, R> | undefined,
	runtime: SubscriptionRuntime<Model, Message, R>
): void {
	if (subscriptions === undefined) return

	const {
		bootModel,
		modelPubSub,
		storeScope,
		runtimeContextForCommands,
		provideAllResources,
		enqueueMessage,
		crashWith,
	} = runtime

	for (const [, entry] of Record.toEntries(subscriptions)) {
		const { dependenciesSchema, modelToDependencies, keepAliveEquivalence, dependenciesToStream } = entry

		const equivalence = keepAliveEquivalence ?? Schema.toEquivalence(dependenciesSchema)
		const initDependencies = modelToDependencies(bootModel)

		const fiber = Effect.gen(function* () {
			const latestDependenciesRef = yield* Ref.make(initDependencies)

			const modelChangesStream = Stream.fromPubSub(modelPubSub).pipe(
				Stream.mapEffect((nextModel) =>
					Effect.gen(function* () {
						const dependencies = modelToDependencies(nextModel)
						yield* Ref.set(latestDependenciesRef, dependencies)
						return dependencies
					})
				)
			)

			yield* Stream.concat(Stream.make(initDependencies), modelChangesStream).pipe(
				Stream.changesWith(equivalence),
				Stream.switchMap((dependencies) =>
					dependenciesToStream(dependencies, () => Ref.getUnsafe(latestDependenciesRef))
				),
				Stream.runForEach((message) =>
					Effect.sync(function () {
						enqueueMessage(message)
					})
				),
				provideAllResources,
				Effect.catchCause((cause) =>
					Effect.sync(function () {
						crashWith(cause, Option.none())
					})
				)
			)
		})

		Effect.runForkWith(runtimeContextForCommands)(Effect.forkIn(fiber, storeScope))
	}
}

/**
 * Lazily builds Layer services once, owned by the store Scope. Waiters join over
 * a cached Fiber, so one waiter leaving never cancels the shared build, while store
 * shutdown interrupts it through Scope close.
 */
const makeAcquireResourceContext = <R>(
	layer: Layer.Layer<R, never, never>,
	scope: Scope.Scope
): Effect.Effect<Effect.Effect<Context.Context<R>>> =>
	Effect.cached(
		Effect.forkIn(Layer.buildWithScope(layer, scope), scope, {
			uninterruptible: false,
		}).pipe(Effect.uninterruptible)
	).pipe(Effect.map((getBuild) => Effect.flatMap(getBuild, Fiber.join)))

/**
 * Allocates a fresh live store in the caller's Scope; services build lazily on first use.
 * Closing that Scope disposes the store, so a host never has to release it by hand.
 */
export const make = <Model, Message, R = never>(
	config: Config<Model, Message, R>,
	init: Update.Return<Model, Message, R>
): Effect.Effect<Store<Model, Message>, never, Scope.Scope> =>
	Effect.gen(function* () {
		const scope = yield* Scope.fork(yield* Scope.Scope)
		// Replay retains a model published before subscription fibers attach.
		const modelPubSub = yield* PubSub.unbounded<Model>({ replay: 1 })
		const layer = resolveLayer((config as { readonly layer?: Layer.Layer<R, never, never> }).layer)
		const acquireResourceContext = yield* makeAcquireResourceContext(layer, scope)
		return yield* Effect.acquireRelease(
			Effect.sync(() => start(config, init, scope, modelPubSub, acquireResourceContext)),
			(store, exit) => store.dispose(exit)
		)
	})

/**
 * Synchronous entry point for imperative hosts. The store owns its Scope, so disposal happens
 * through `Store.dispose`. Effect programs should use {@link make} and let their Scope own it.
 */
export const boot = <Model, Message, R = never>(
	config: Config<Model, Message, R>,
	init: Update.Return<Model, Message, R>
): Store<Model, Message> => Effect.runSync(make(config, init).pipe(Scope.provide(Scope.makeUnsafe())))

function start<Model, Message, R>(
	config: Config<Model, Message, R>,
	init: Update.Return<Model, Message, R>,
	storeScope: Scope.Closeable,
	modelPubSub: PubSub.PubSub<Model>,
	acquireResourceContext: Effect.Effect<Context.Context<R>>
) {
	const listeners = new Set<() => void>()
	const crashListeners = new Set<() => void>()
	type PendingMessage = {
		readonly message: Message
		readonly command?: Update.Commands<Message, R>[number]
	}
	const pendingMessages = MutableList.make<PendingMessage>()
	let phase: Phase = { _tag: "Booting" }
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
		phase = { _tag: "Crashed", cause }
		MutableList.clear(pendingMessages)
		for (const listener of crashListeners) {
			const exit = Effect.runSyncExit(Effect.sync(listener))
			if (Exit.isFailure(exit)) Effect.runFork(Effect.logError(exit.cause))
		}
		if (config.onCrash !== undefined) config.onCrash(cause, triggeringMessage)
		else Effect.runFork(Effect.logError("[react-foldkit] Store crashed:", Cause.pretty(cause)))
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
				phase = { _tag: "Live", drain: "Idle" }
				syncWorkMsSinceYield = 0
				drainPendingMessages()
			}
		}
		phase = { _tag: "Live", drain: "Deferred" }
		deferredDrainChannel.port1.postMessage(null)
	}

	function forkCommand(
		command: Update.Commands<Message, R>[number],
		triggeringMessage: Option.Option<Message>
	): void {
		const effect = Effect.suspend(function () {
			if (isTerminal(phase)) return Effect.void

			// `command.effect` is typed loosely upstream; cast is required at this boundary.
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
		Effect.runForkWith(runtimeContextForCommands)(Effect.forkIn(effect, storeScope))
	}

	function processMessage({ message, command }: PendingMessage): void {
		try {
			const result = config.update(model, message)
			const previous = model
			model = result.model
			if (command !== undefined) InitCommand.complete(command)
			if (previous !== result.model) {
				publishModel(result.model)
				for (const listener of listeners) listener()
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

		phase = { _tag: "Live", drain: "Sync" }
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
				phase = { _tag: "Live", drain: "Idle" }
			}
		}
	}

	function canCommit(): Result.Result<void, CommitError> {
		switch (phase._tag) {
			case "Booting":
				return Result.fail(new CommitError({ reason: "Inactive" }))
			case "Crashed":
				return Result.fail(new CommitError({ reason: "Crashed", cause: phase.cause }))
			case "Disposed":
				return Result.fail(new CommitError({ reason: "Disposed" }))
			case "Live":
				return phase.drain === "Sync" ? Result.fail(new CommitError({ reason: "Reentrant" })) : Result.void
		}
	}

	const commit = (message: Message): Result.Result<void, CommitError> =>
		Result.flatMap(canCommit(), function () {
			const entry = { message }
			MutableList.append(pendingMessages, entry)
			cancelDeferredDrain()
			phase = { _tag: "Live", drain: "Idle" }
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
				phase = { _tag: "Disposed", crash: getCrash() }
				const notify = [...listeners]
				return Effect.sync(function () {
					MutableList.clear(pendingMessages)
					listeners.clear()
					crashListeners.clear()
					cancelDeferredDrain()
					for (const listener of notify) listener()
				}).pipe(
					Effect.ensuring(Scope.close(storeScope, exit)),
					Effect.onExit((result) => Deferred.done(disposal, result))
				)
			})
		)

	// Foldkit: attach subscriptions before lifting the boot barrier so their
	// init deps see the init Model, then fork init Commands, then go Live.
	forkSubscriptionFibers(config.subscriptions, {
		bootModel: initialModel,
		modelPubSub,
		storeScope,
		runtimeContextForCommands,
		provideAllResources,
		enqueueMessage,
		crashWith,
	})

	if (initCommands.length > 0) {
		for (const command of initCommands) forkCommand(command, Option.none())
	}

	if (!isTerminal(phase)) {
		phase = { _tag: "Live", drain: "Idle" }
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
