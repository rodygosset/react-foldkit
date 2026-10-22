import { Array, Cause, Effect, Exit, Function, Option, Schema, SubscriptionRef } from "effect"
import type { DevToolsConfig, DevToolsPosition, DevToolsMode } from "foldkit/runtime"
import { createDevToolsStore, type DevToolsStore } from "./devtoolsVendor/devTools/store.js"
import { extractSubmodelInfo } from "./devtoolsVendor/devTools/submodelPath.js"
import { startWebSocketBridge } from "./devtoolsVendor/devTools/webSocketBridge.js"
import * as Overlay from "./devtoolsOverlay"
import type * as Store from "./store/store"

type Command<Message, R> = Store.RuntimeCommand<Message, R>["command"]

export type Config<Message> =
	| false
	| (Exclude<DevToolsConfig, false> & {
			readonly Message?: Schema.Codec<NoInfer<Message>, unknown, unknown, unknown>
	  })

export type Display<Model> = Readonly<{
	get: () => Model
	subscribe: (listener: () => void) => () => void
	set: (model: Model) => void
}>

export function makeDisplay<Model>(initial: Model): Display<Model> {
	let model = initial
	const listeners = new Set<() => void>()
	return {
		get: () => model,
		subscribe(listener) {
			listeners.add(listener)
			return () => listeners.delete(listener)
		},
		set(next) {
			if (Object.is(model, next)) return
			model = next
			for (const listener of Array.fromIterable(listeners)) {
				try {
					listener()
				} catch (error) {
					Effect.runFork(Effect.logError(Cause.die(error)))
				}
			}
		},
	}
}

export function makeObserver<Model, Message extends { readonly _tag: string }, R>(options: {
	readonly config: Config<Message> | undefined
	readonly update: (model: Model, message: Message) => { readonly model: Model }
	readonly modelSchema: Schema.Codec<Model, unknown, unknown, unknown>
	readonly display: Display<Model>
	readonly freeze: (model: Model) => Model
	readonly readLive: () => Model
	readonly dispatch: (message: Message) => void
}): Readonly<{
	readonly observer: Store.RuntimeObserver<Model, Message, R>
	readonly install: Effect.Effect<void, never, import("effect").Scope.Scope>
	readonly isPaused: () => boolean
}> {
	let devToolsStore: DevToolsStore | undefined
	let nextCommandId = 0
	const commandRecord = (command: Command<Message, R>, id: number) =>
		command.args === undefined
			? { id, name: command.name, maybeSubmodelPath: Option.none() }
			: { id, name: command.name, args: command.args, maybeSubmodelPath: Option.none() }
	const config = options.config === false ? {} : (options.config ?? {})
	const excluded = new Set(config?.excludeFromHistory ?? [])
	// History replay is synchronous by the DevToolsStore contract and only runs the pure Model codec.
	// A recorded Model that no longer decodes is a defect, as it is in Foldkit's runtime.
	const decodeModelExit = Schema.decodeUnknownExit(options.modelSchema as Schema.Codec<Model, unknown, never, never>)
	const decodeModel = (model: unknown): Model =>
		Exit.match(decodeModelExit(model), {
			onSuccess: Function.identity,
			onFailure(cause) {
				throw Cause.squash(cause)
			},
		})
	const isPaused = () => devToolsStore !== undefined && SubscriptionRef.getUnsafe(devToolsStore.stateRef).isPaused
	const observer: Store.RuntimeObserver<Model, Message, R> = {
		recordInit(model, commands) {
			const ids = commands.map(() => nextCommandId++)
			if (devToolsStore !== undefined)
				Effect.runFork(
					devToolsStore.recordInit(
						model,
						commands.map((command, index) => commandRecord(command, ids[index]!))
					)
				)
			return ids
		},
		recordMessage(message, before, after, commands) {
			const ids = commands.map(() => nextCommandId++)
			if (!isPaused()) options.display.set(options.freeze(after))
			const store = devToolsStore
			if (store !== undefined) {
				const tag = message._tag
				if (excluded.has(tag)) {
					if (!Object.is(before, after)) Effect.runFork(store.updateLatestModel(after))
				} else {
					Effect.runFork(
						store.recordMessage(
							message,
							before,
							after,
							commands.map((command, index) => commandRecord(command, ids[index]!)),
							!Object.is(before, after)
						)
					)
				}
			}
			return ids
		},
		recordCommandResult(id, message) {
			if (devToolsStore === undefined) return
			const path = extractSubmodelInfo(message._tag, message).submodelPath
			Effect.runFork(devToolsStore.recordResolvedCommand(id, path))
		},
	}

	const install: Effect.Effect<void, never, import("effect").Scope.Scope> = Effect.gen(function* () {
		const hot = Overlay.getHot()
		if (options.config === false) return
		// Matches Foldkit's resolveDevToolsConfig: "Always" shows everywhere, and "Development" needs
		// Vite's dev server and a top-level window so an embedded preview does not stack a second panel.
		const inTopLevelWindow = typeof window !== "undefined" && window.self === window.top
		const show = config.show ?? "Development"
		if (show !== "Always" && (hot === undefined || !inTopLevelWindow)) return
		const position: DevToolsPosition = config.position ?? "BottomRight"
		const configuredMode = config.mode ?? "TimeTravel"
		const mode: DevToolsMode =
			typeof configuredMode === "string"
				? configuredMode
				: hot !== undefined
					? configuredMode.development
					: configuredMode.production
		const excludedMessages = excluded.size > 0
		const maxEntries = Math.max(20, Math.min(500, Math.floor(config.maxEntries ?? 100)))
		const keyframeInterval = excludedMessages
			? 1
			: Math.min(maxEntries, Math.max(1, Math.floor(config.keyframeInterval ?? 31)))
		if (devToolsStore === undefined) {
			const store = yield* createDevToolsStore(
				{
					replay(model, message) {
						const decoded = decodeModel(model)
						const next = options.update(decoded, message as Message).model
						return options.freeze(next)
					},
					render: (model) => Effect.sync(() => options.display.set(options.freeze(decodeModel(model)))),
					markRenderPending: Effect.sync(function () {
						if (devToolsStore !== undefined && !SubscriptionRef.getUnsafe(devToolsStore.stateRef).isPaused)
							options.display.set(options.readLive())
					}),
				},
				{ maxEntries, keyframeInterval }
			)
			devToolsStore = store
		}
		const store = devToolsStore
		yield* Overlay.register(store, position, mode, Option.fromNullishOr(config.banner))
		if (hot !== undefined) {
			const maybeMessage =
				config.Message !== undefined
					? Option.some(config.Message as Schema.Codec<any, any, never, never>)
					: Option.none()
			yield* startWebSocketBridge(
				store,
				hot,
				(message) => Effect.sync(() => options.dispatch(message as Message)),
				maybeMessage
			)
		}
	})
	return { observer, install, isPaused }
}
