import { Array, Cause, Effect, Option, Schema, SubscriptionRef } from "effect"
import type { DevToolsConfig, DevToolsMode, DevToolsModeConfig, DevToolsPosition } from "foldkit/runtime"
import type * as Update from "foldkit/update"
import * as Overlay from "./devtoolsOverlay"
import { createDevToolsStore, type DevToolsStore } from "./devtoolsVendor/devTools/store.js"
import { extractSubmodelInfo, isTagged } from "./devtoolsVendor/devTools/submodelPath.js"
import { startWebSocketBridge } from "./devtoolsVendor/devTools/webSocketBridge.js"
import {
	resolveDevToolsKeyframeInterval,
	resolveDevToolsMaxEntries,
	resolveExcludeFromHistoryTags,
} from "./devtoolsVendor/runtime/devToolsConfig.js"
import { isVisible } from "./devtoolsVendor/runtime/visibility.js"
import * as InitCommand from "./internal/initCommand"
import type * as Store from "./store/store"

type Command<Message, R> = Update.Commands<Message, R>[number]

/**
 * Foldkit DevTools settings for one application.
 *
 * `Message` is the Schema the MCP relay uses to decode dispatched Messages. It
 * has to decode synchronously and without Effect services, because replay and
 * dispatch run outside a fiber.
 *
 * @category configuration
 * @since 0.2.0
 */
export type Config<MessageSchema extends Schema.Codec<unknown, unknown>> =
	| false
	| (Omit<Exclude<DevToolsConfig, false>, "Message"> & {
			readonly Message?: MessageSchema
	  })

export function makeObserver<
	ModelSchema extends Schema.Codec<unknown, unknown>,
	MessageSchema extends Schema.Codec<unknown, unknown>,
	R,
>(options: {
	readonly config: Exclude<Config<MessageSchema>, false>
	readonly update: (
		model: ModelSchema["Type"],
		message: MessageSchema["Type"]
	) => { readonly model: ModelSchema["Type"] }
	readonly Model: ModelSchema
	readonly freeze: (model: ModelSchema["Type"]) => ModelSchema["Type"]
	readonly readLive: () => ModelSchema["Type"]
	readonly dispatch: (message: MessageSchema["Type"]) => void
}): Readonly<{
	readonly observer: Store.RuntimeObserver<ModelSchema["Type"], MessageSchema["Type"], R>
	readonly install: Effect.Effect<void, never, import("effect").Scope.Scope>
	readonly isPaused: () => boolean
	readonly pausedModel: () => ModelSchema["Type"] | undefined
	readonly subscribePause: (listener: () => void) => () => void
}> {
	type Model = ModelSchema["Type"]
	type Message = MessageSchema["Type"]
	let devToolsStore: DevToolsStore | undefined
	let nextCommandId = 0
	let historical: Model | undefined
	const pauseListeners = new Set<() => void>()
	const prepared = new WeakMap<object, Array<Command<Message, R>>>()
	const remembered = new WeakMap<object, Array<Command<Message, R>>>()
	const knownMessages = new WeakMap<object, Message>()
	const config = options.config
	const messageSchema = config.Message
	const excluded = resolveExcludeFromHistoryTags(config)
	// Replay runs inside the DevTools store, which calls this synchronously.
	// @effect-diagnostics-next-line schemaSync:off
	const decodeModel = Schema.decodeUnknownSync(options.Model)

	function notifyPause(): void {
		for (const listener of Array.fromIterable(pauseListeners)) {
			try {
				listener()
			} catch (error) {
				Effect.runFork(Effect.logError(Cause.die(error)))
			}
		}
	}

	function remember(message: Message): void {
		if (typeof message === "object" && message !== null) knownMessages.set(message, message)
	}

	function replayMessage(message: unknown): Message {
		if (typeof message === "object" && message !== null) {
			const known = knownMessages.get(message)
			if (known !== undefined) return known
		}
		if (messageSchema !== undefined) {
			// @effect-diagnostics-next-line schemaSync:off
			return Schema.decodeUnknownSync(messageSchema)(message)
		}
		return Effect.runSync(Effect.die(new Error("DevTools replay received an unrecorded Message")))
	}

	function recordResolved(id: number, message: Message): Effect.Effect<void> {
		const store = devToolsStore
		if (store === undefined || !isTagged(message)) return Effect.void
		const path = extractSubmodelInfo(message._tag, message).submodelPath
		return store.recordResolvedCommand(id, path).pipe(Effect.catchCause((cause) => Effect.logError(cause)))
	}

	const watch = (command: Command<Message, R>, id: number): Command<Message, R> => ({
		...command,
		effect: command.effect.pipe(Effect.tap((message) => recordResolved(id, message))),
	})

	const enqueue = (commands: Update.Commands<Message, R>): Array<{
		readonly id: number
		readonly name: string
		readonly args?: Record<string, unknown>
		readonly maybeSubmodelPath: Option.Option<ReadonlyArray<string>>
	}> =>
		commands.map(function (command) {
			const id = nextCommandId++
			const wrapped = watch(command, id)
			const queue = prepared.get(command) ?? []
			queue.push(wrapped)
			prepared.set(command, queue)
			return command.args === undefined
				? { id, name: command.name, maybeSubmodelPath: Option.none() }
				: { id, name: command.name, args: command.args, maybeSubmodelPath: Option.none() }
		})

	function adoptCommand(command: Command<Message, R>): Command<Message, R> {
		const preparedCommand = prepared.get(command)?.shift()
		if (preparedCommand !== undefined) {
			if (InitCommand.isTracked(command)) {
				const stored = remembered.get(command) ?? []
				stored.push(preparedCommand)
				remembered.set(command, stored)
			}
			return preparedCommand
		}
		const stored = remembered.get(command)
		const reused = stored?.shift()
		if (stored === undefined || reused === undefined) return command
		stored.push(reused)
		return reused
	}

	const isPaused = (): boolean =>
		devToolsStore !== undefined && SubscriptionRef.getUnsafe(devToolsStore.stateRef).isPaused

	const observer: Store.RuntimeObserver<Model, Message, R> = {
		recordInit(model, commands) {
			const store = devToolsStore
			if (store === undefined) return
			Effect.runFork(store.recordInit(model, enqueue(commands)))
		},
		recordMessage(message, before, after, commands) {
			remember(message)
			const store = devToolsStore
			if (store === undefined || !isTagged(message)) return
			if (excluded.has(message._tag)) {
				if (!Object.is(before, after)) Effect.runFork(store.updateLatestModel(after))
				return
			}
			Effect.runFork(store.recordMessage(message, before, after, enqueue(commands), !Object.is(before, after)))
		},
		adoptCommand,
	}

	const install: Effect.Effect<void, never, import("effect").Scope.Scope> = Effect.gen(function* () {
		const hot = Overlay.getHot()
		const inTopLevelWindow = typeof window !== "undefined" && window.self === window.top
		const show = config.show ?? "Development"
		if (!isVisible(show, hot !== undefined && inTopLevelWindow)) return
		const position: DevToolsPosition = config.position ?? "BottomRight"
		const mode = resolveMode(config.mode ?? "TimeTravel", hot)
		const maxEntries = resolveDevToolsMaxEntries(config) ?? 100
		const keyframeInterval = excluded.size > 0 ? 1 : (resolveDevToolsKeyframeInterval(config) ?? 31)
		if (devToolsStore === undefined) {
			const store = yield* createDevToolsStore(
				{
					replay(model, message) {
						const decoded = decodeModel(model)
						return options.freeze(options.update(decoded, replayMessage(message)).model)
					},
					render: (model) =>
						Effect.sync(function () {
							historical = options.freeze(decodeModel(model))
							notifyPause()
						}),
					markRenderPending: Effect.sync(function () {
						if (devToolsStore !== undefined && !SubscriptionRef.getUnsafe(devToolsStore.stateRef).isPaused) {
							historical = undefined
							notifyPause()
						}
					}),
				},
				{ maxEntries, keyframeInterval }
			)
			devToolsStore = store
		}
		const store = devToolsStore
		yield* Overlay.register(store, position, mode, Option.fromNullishOr(config.banner))
		if (hot !== undefined) {
			yield* startWebSocketBridge(
				store,
				hot,
				function (message) {
					if (messageSchema === undefined) return Effect.void
					const schema = Schema.toType(messageSchema)
					return Effect.sync(function () {
						// @effect-diagnostics-next-line schemaSync:off
						options.dispatch(Schema.decodeUnknownSync(schema)(message))
					})
				},
				Option.fromNullishOr(messageSchema)
			)
		}
	})

	return {
		observer,
		install,
		isPaused,
		pausedModel: () => historical,
		subscribePause(listener) {
			pauseListeners.add(listener)
			return function () {
				pauseListeners.delete(listener)
			}
		},
	}
}

function resolveMode(configured: DevToolsModeConfig, hot: Overlay.Hot | undefined): DevToolsMode {
	if (typeof configured === "string") return configured
	if (hot !== undefined) return configured.development
	return configured.production
}
