import { Cause, Context, Effect, Exit, Layer, Option, Scope } from "effect"
import {
	CurrentInterruptRegistry,
	type InterruptRegistry,
	makeInterruptRegistry,
} from "./internal/foldkit"
import type * as Update from "./update"

type ConfigBase<Model, Message, R> = {
	update: (model: Model, message: Message) => Update.Return<Model, Message, R>
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

export const StoreTypeId: unique symbol = Symbol.for("@workspace/react-foldkit/StoreTypeId")
export type StoreTypeId = typeof StoreTypeId

export type Store<Model, Message> = {
	readonly [StoreTypeId]: StoreTypeId
	getModel: () => Model
	subscribe: (listener: () => void) => () => void
	dispatch: (message: Message) => void
	dispose: () => void
}

/** Sync drain yields to the browser after this much cumulative work (Foldkit). */
const DRAIN_BUDGET_MS = 5

/**
 * Single lifecycle + drain state machine. Replaces disposed/crashed/draining/
 * bootComplete/drainDeferred flags. Drain modes only apply while `Live`.
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

	/**
	 * Foldkit captures `runtimeContextForCommands` once so Command fibers inherit
	 * the ambient scheduler via `Effect.runForkWith`. Using `runFork` alone is
	 * fine for simple Commands; `runForkWith` matches Foldkit so yields
	 * (op-budget, Stream steps, sleep) reschedule on the captured microtask
	 * scheduler rather than a temporary sync scheduler.
	 */
	const runtimeContextForCommands = Effect.runSync(Effect.context<never>())

	const [initialModel, initCommands] = init
	let model: Model = initialModel

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

	function enqueueMessage(message: Message): void {
		if (isTerminal(phase)) return
		pendingMessages.push(message)
		if (phase._tag === "Booting") return
		drainPendingMessages()
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
						enqueueMessage(message)
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
			const [nextModel, commands] = config.update(model, message)
			const previous = model
			model = nextModel
			if (previous !== nextModel) {
				for (const listener of listeners) listener()
			}
			for (const command of commands) forkCommand(command, Option.some(message))
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
		listeners.clear()
		if (deferredDrainChannel !== null) {
			deferredDrainChannel.port1.close()
			deferredDrainChannel.port2.close()
			deferredDrainChannel = null
		}
		Effect.runFork(Scope.close(storeScope, Exit.void))
	}

	if (initCommands.length > 0) {
		for (const command of initCommands) forkCommand(command, Option.none())
	}

	phase = { _tag: "Live", drain: "Idle" }
	drainPendingMessages()

	return {
		[StoreTypeId]: StoreTypeId,
		getModel: () => model,
		subscribe,
		dispatch: enqueueMessage,
		dispose,
	}
}
