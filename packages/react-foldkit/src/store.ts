import {
	Cause,
	Context,
	Effect,
	Exit,
	Layer,
	Option,
	PubSub,
	Record,
	Ref,
	Scheduler,
	Schema,
	Scope,
	Stream,
} from "effect"
import { CurrentInterruptRegistry, type InterruptRegistry, makeInterruptRegistry } from "./internal/foldkit"
import * as InitCommand from "./internal/init-command"
import type * as Subscription from "./subscription"
import type * as Update from "./update"

type ConfigBase<Model, Message, R> = {
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
 * Program definition: update + services. Init is supplied later via {@link boot}.
 *
 * When `R` is `never`, `layer` is optional (defaults to {@link Layer.empty}).
 * When `R` is not `never`, `layer` is required so Command Effects can be provided.
 */
export type Config<Model, Message, R = never> = [R] extends [never]
	? ConfigBase<Model, Message, R> & {
			layer?: Layer.Layer<never, never, never>
		}
	: ConfigBase<Model, Message, R> & {
			layer: Layer.Layer<R, never, never>
		}

export namespace Config {
	export function make<Model, Message, R = never>(
		config: ConfigBase<Model, Message, R> & {
			readonly layer?: Layer.Layer<R, never, never> | Layer.Layer<never, never, never>
		}
	): Config<Model, Message, R> {
		return config as Config<Model, Message, R>
	}
}

export const StoreTypeId: unique symbol = Symbol.for("react-foldkit/StoreTypeId")
export type StoreTypeId = typeof StoreTypeId

export type Store<Model, Message> = Readonly<{
	[StoreTypeId]: StoreTypeId
	getModel: () => Model
	subscribe: (listener: () => void) => () => void
	dispatch: (message: Message) => void
	dispose: () => void
	isDisposed: () => boolean
}>

/** Failed {@link takeWhen} because {@link Store.dispose} ran first. */
export class Disposed extends Schema.Error<Disposed>("react-foldkit/Store/Disposed")({
	_tag: Schema.tag("Disposed"),
}) {}

/**
 * Succeeds with the first Model for which `pick` returns `Option.some`.
 * Fails with {@link Disposed} if the store is disposed first.
 * Interrupting the Effect unsubscribes.
 */
export const takeWhen = <Model, Message, A>(
	store: Store<Model, Message>,
	pick: (model: Model) => Option.Option<A>
): Effect.Effect<A, Disposed> =>
	Effect.callback<A, Disposed>(function (resume, signal) {
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

		const unsubscribe = store.subscribe(function onStoreChange() {
			if (tryPick()) {
				unsubscribe()
			}
		})

		signal.addEventListener(
			"abort",
			function onTakeWhenAbort() {
				unsubscribe()
			},
			{ once: true }
		)

		return Effect.sync(function unsubscribeTakeWhen() {
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
	| { readonly _tag: "Crashed" }
	| { readonly _tag: "Disposed" }

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
	return function cancel() {
		cancelled = true
	}
}

const browserScheduler = new Scheduler.MixedScheduler("async", microtaskSetImmediate)

/**
 * Captures a Context that already carries {@link browserScheduler}, so
 * `Effect.runForkWith` reschedules fiber yields on microtasks (Foldkit parity).
 */
const captureRuntimeContextForCommands = (): Context.Context<never> =>
	Effect.runSync(Effect.provide(Effect.context<never>(), Layer.succeed(Scheduler.Scheduler, browserScheduler)))

/**
 * Cached Foldkit-style resource Context: Layer builds once into `storeScope`.
 * Always an Effect (never `undefined`) — uses {@link Layer.empty} when `R` is `never`.
 */
const makeAcquireResourceContext = <R>(
	layer: Layer.Layer<R, never, never>,
	storeScope: Scope.Scope
): Effect.Effect<Context.Context<R>> =>
	Effect.runSync(Effect.cached(Effect.uninterruptible(Layer.buildWithScope(layer, storeScope))))

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
				Stream.mapEffect(function (nextModel) {
					return Effect.gen(function* () {
						const dependencies = modelToDependencies(nextModel)
						yield* Ref.set(latestDependenciesRef, dependencies)
						return dependencies
					})
				})
			)

			yield* Stream.concat(Stream.make(initDependencies), modelChangesStream).pipe(
				Stream.changesWith(equivalence),
				Stream.switchMap(function (dependencies) {
					return dependenciesToStream(dependencies, function () {
						return Ref.getUnsafe(latestDependenciesRef)
					})
				}),
				Stream.runForEach(function (message) {
					return Effect.sync(function () {
						enqueueMessage(message)
					})
				}),
				provideAllResources,
				Effect.catchCause(function (cause) {
					return Effect.sync(function () {
						crashWith(cause, Option.none())
					})
				})
			)
		})

		Effect.runForkWith(runtimeContextForCommands)(Effect.forkIn(fiber, storeScope))
	}
}

/**
 * Starts a live store from a config and an init return. Init Commands are
 * forked after the boot barrier lifts so subscribers can attach first.
 * Call from the React Provider (or tests), not at module load.
 */
export function boot<Model, Message, R = never>(
	config: Config<Model, Message, R>,
	init: Update.Return<Model, Message, R>
): Store<Model, Message> {
	const listeners = new Set<() => void>()
	let pendingMessages: Array<Message> = []
	let phase: Phase = { _tag: "Booting" }
	let syncWorkMsSinceYield = 0
	let lastDrainEndedAt = 0
	let deferredDrainChannel: MessageChannel | null = null

	const storeScope = Scope.makeUnsafe()
	const interruptRegistry = makeInterruptRegistry()
	// replay:1 covers the async fork race: a model published before the
	// subscription fiber attaches to PubSub is not lost. Init deps are still
	// seeded explicitly via Stream.concat (Foldkit).
	const modelPubSub = Effect.runSync(PubSub.unbounded<Model>({ replay: 1 }))
	const runtimeContextForCommands = captureRuntimeContextForCommands()

	const initialModel = init.model
	const initCommands = init.commands ?? []
	let model: Model = initialModel
	PubSub.publishUnsafe(modelPubSub, model)

	const provideAllResources = makeProvideAllResources(
		makeAcquireResourceContext(
			resolveLayer((config as { readonly layer?: Layer.Layer<R, never, never> }).layer),
			storeScope
		),
		interruptRegistry
	)

	function crashWith(cause: Cause.Cause<unknown>, triggeringMessage: Option.Option<Message>): void {
		if (isTerminal(phase)) return
		phase = { _tag: "Crashed" }
		if (config.onCrash !== undefined) config.onCrash(cause, triggeringMessage)
		else console.error("[react-foldkit] Store crashed:", Cause.pretty(cause))
	}

	function enqueueMessage(message: Message): boolean {
		if (isTerminal(phase)) return false
		pendingMessages.push(message)
		if (phase._tag === "Booting") return true
		drainPendingMessages()
		return true
	}

	function publishModel(nextModel: Model): void {
		PubSub.publishUnsafe(modelPubSub, nextModel)
	}

	function scheduleDeferredDrain(): void {
		if (isTerminal(phase)) return
		if (deferredDrainChannel === null) {
			const channel = new MessageChannel()
			deferredDrainChannel = channel
			channel.port2.onmessage = function onDeferredDrain() {
				if (phase._tag === "Live" && phase.drain === "Deferred") {
					phase = { _tag: "Live", drain: "Idle" }
				}
				syncWorkMsSinceYield = 0
				drainPendingMessages()
			}
		}
		if (phase._tag === "Live") phase = { _tag: "Live", drain: "Deferred" }
		deferredDrainChannel.port1.postMessage(null)
	}

	function forkCommand(
		command: Update.Commands<Message, R>[number],
		triggeringMessage: Option.Option<Message>
	): void {
		queueMicrotask(function startCommandFiber() {
			if (isTerminal(phase)) return

			// `command.effect` is typed loosely upstream; cast is required at this boundary.
			const effect = (command.effect as Effect.Effect<Message, never, R>).pipe(
				Effect.withSpan(command.name, {
					attributes: command.args ?? {},
				}),
				provideAllResources,
				Effect.flatMap(function (message) {
					return Effect.sync(function () {
						if (enqueueMessage(message)) InitCommand.complete(command)
					})
				}),
				Effect.catchCause(function (cause) {
					return Effect.sync(function () {
						crashWith(cause, triggeringMessage)
					})
				})
			)

			Effect.runForkWith(runtimeContextForCommands)(Effect.forkIn(effect, storeScope))
		})
	}

	function processMessage(message: Message): void {
		try {
			const result = config.update(model, message)
			const previous = model
			model = result.model
			if (previous !== result.model) {
				publishModel(result.model)
				for (const listener of listeners) listener()
			}
			for (const command of result.commands ?? []) forkCommand(command, Option.some(message))
		} catch (error) {
			crashWith(Cause.die(error), Option.some(message))
		}
	}

	function drainPendingMessages(): void {
		if (!canEnterDrain(phase)) return

		const drainStartedAt = performance.now()
		if (drainStartedAt - lastDrainEndedAt > DRAIN_BUDGET_MS) syncWorkMsSinceYield = 0

		if (syncWorkMsSinceYield > DRAIN_BUDGET_MS) {
			scheduleDeferredDrain()
			return
		}

		phase = { _tag: "Live", drain: "Sync" }
		let currentMessage: Option.Option<Message> = Option.none()
		try {
			while (pendingMessages.length > 0) {
				const batch = pendingMessages
				pendingMessages = []
				let index = 0
				for (const message of batch) {
					if (isTerminal(phase)) return

					currentMessage = Option.some(message)
					processMessage(message)

					const hasRemainingWork = index + 1 < batch.length || pendingMessages.length > 0
					if (
						hasRemainingWork &&
						syncWorkMsSinceYield + (performance.now() - drainStartedAt) > DRAIN_BUDGET_MS
					) {
						pendingMessages = batch.slice(index + 1).concat(pendingMessages)
						scheduleDeferredDrain()
						return
					}
					index += 1
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

	function subscribe(listener: () => void): () => void {
		listeners.add(listener)
		return function unsubscribe() {
			listeners.delete(listener)
		}
	}

	function dispose(): void {
		if (phase._tag === "Disposed") return
		phase = { _tag: "Disposed" }
		pendingMessages = []
		for (const listener of listeners) {
			listener()
		}
		listeners.clear()
		if (deferredDrainChannel !== null) {
			deferredDrainChannel.port1.close()
			deferredDrainChannel.port2.close()
			deferredDrainChannel = null
		}
		Effect.runFork(Scope.close(storeScope, Exit.void))
	}

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
		subscribe,
		dispatch: enqueueMessage,
		dispose,
		isDisposed: () => phase._tag === "Disposed",
	}
}
