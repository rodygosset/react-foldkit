import { Message } from "../test/fixtures/message"
import { it } from "@effect/vitest"
import { Effect, Option, Result, Schema, SubscriptionRef } from "effect"
import { describe, expect } from "vitest"
import * as ReactStore from "./application/reactStore"
import * as DevTools from "./devtools"
import type { DevToolsStore } from "foldkit/devtools-host"
import { dispatchRequest } from "./devtoolsVendor/devTools/webSocketBridge.js"
import type * as Update from "foldkit/update"

const makeHarness = (
	config: { readonly maxEntries?: number; readonly keyframeInterval?: number } = {},
	commands: Update.Commands<Message> = []
) =>
	Effect.gen(function* () {
		let history: DevToolsStore | undefined
		yield* Effect.acquireRelease(
			Effect.sync(() =>
				DevTools.__configure(
					(store) =>
						Effect.sync(function () {
							history = store
						}),
					undefined
				)
			),
			(dispose) => Effect.sync(dispose)
		)
		const store = ReactStore.make<number, Message>(
			{
				update: (model, message) => ({ model: model + message.value }),
				devTools: { show: "Always", ...config },
			},
			{ model: 0, commands },
			Schema.Finite
		)
		yield* store.activate
		return { store, history: Option.getOrThrow(Option.fromUndefinedOr(history)) }
	})

describe("DevTools history integration", function () {
	it.live("clears history at the live Model and replays later entries from that baseline", () =>
		Effect.gen(function* () {
			const { store, history } = yield* makeHarness({}, [{ name: "OldInit", effect: Effect.never }])
			expect(SubscriptionRef.getUnsafe(history.stateRef).initCommands).toHaveLength(1)
			store.commit(Message.SetValue({ value: 5 }))
			yield* history.clear
			expect(yield* history.getModelAtIndex(-1)).toBe(5)
			expect(SubscriptionRef.getUnsafe(history.stateRef).entries).toEqual([])
			expect(SubscriptionRef.getUnsafe(history.stateRef).initCommands).toEqual([])
			store.commit(Message.SetValue({ value: 1 }))
			store.commit(Message.SetValue({ value: 1 }))
			yield* history.jumpTo(0)
			expect(store.readView()).toBe(6)
			expect(store.getModel()).toBe(7)
			expect(store.commit(Message.SetValue({ value: 1 }))).toEqual(Result.void)
			expect(store.getModel()).toBe(7)
			yield* history.clear
			expect(store.readView()).toBe(6)
			expect(SubscriptionRef.getUnsafe(history.stateRef).entries).toHaveLength(2)
			yield* history.resume
			expect(store.readView()).toBe(7)
		}).pipe(Effect.scoped)
	)

	it.live("activates every Provider when two register in one turn", () =>
		Effect.gen(function* () {
			yield* Effect.acquireRelease(
				Effect.sync(() => DevTools.__configure(() => Effect.void, undefined)),
				(dispose) => Effect.sync(dispose)
			)
			const first = ReactStore.make<number, Message>(
				{
					update: (model, message) => ({ model: model + message.value }),
					devTools: { show: "Always" },
				},
				{ model: 0 },
				Schema.Finite
			)
			const second = ReactStore.make<number, Message>(
				{
					update: (model, message) => ({ model: model + message.value }),
					devTools: { show: "Always" },
				},
				{ model: 0 },
				Schema.Finite
			)
			yield* Effect.all([first.activate, second.activate], { concurrency: "unbounded" }).pipe(
				Effect.timeout("2 seconds")
			)
		}).pipe(Effect.scoped)
	)

	it.live("records tagged Messages and replays their original payload", () =>
		Effect.gen(function* () {
			const { store, history } = yield* makeHarness()
			store.commit(Message.SetValue({ value: 2 }))
			store.commit(Message.SetValue({ value: 3 }))
			const state = SubscriptionRef.getUnsafe(history.stateRef)
			expect(state.entries.map(({ tag }) => tag)).toEqual(["SetValue", "SetValue"])
			expect(yield* history.getMessageAtIndex(0)).toEqual(Option.some(Message.SetValue({ value: 2 })))
			yield* history.jumpTo(0)
			expect(store.readView()).toBe(2)
			expect(store.getModel()).toBe(5)
			const response = yield* dispatchRequest(history, () => Effect.void, Option.none(), Option.none(), {
				_tag: "RequestListMessages",
				limit: 10,
				maybeSinceIndex: Option.none(),
				maybeChangedPathsMatch: Option.none(),
				fromEnd: false,
			})
			expect(response._tag).toBe("ResponseMessages")
		}).pipe(Effect.scoped)
	)

	it.live.each([
		{ maxEntries: 20, keyframeInterval: 1 },
		{ maxEntries: 20, keyframeInterval: 5 },
		{ keyframeInterval: 10 },
	])("keeps every retained entry readable after eviction with %j", (config) =>
		Effect.gen(function* () {
			const { store, history } = yield* makeHarness(config)
			for (let index = 0; index < 123; index++) store.commit(Message.SetValue({ value: 1 }))
			const state = SubscriptionRef.getUnsafe(history.stateRef)
			expect(state.entries.length).toBeGreaterThan(0)
			expect(state.entries.length).toBeLessThanOrEqual(config.maxEntries ?? 100)
			for (let offset = 0; offset < state.entries.length; offset++) {
				const index = state.startIndex + offset
				expect(yield* history.getModelAtIndex(index)).toBe(index + 1)
			}
			yield* history.jumpTo(state.startIndex)
			expect(store.readView()).toBe(state.startIndex + 1)
			yield* history.resume
			expect(store.readView()).toBe(123)
		}).pipe(Effect.scoped)
	)
})

describe("DevTools registration", function () {
	it.live("records nothing until react-foldkit/devtools registers the recorder", () =>
		Effect.gen(function* () {
			const store = ReactStore.make<number, Message>(
				{
					update: (model, message) => ({ model: model + message.value }),
					devTools: { show: "Always" },
				},
				{ model: 0 },
				Schema.Finite
			)
			let recorded: DevToolsStore | undefined
			yield* Effect.acquireRelease(
				Effect.sync(() =>
					DevTools.__configure(
						(history) =>
							Effect.sync(function () {
								recorded = history
							}),
						undefined
					)
				),
				(dispose) => Effect.sync(dispose)
			)
			yield* store.activate
			yield* Effect.sleep("20 millis")
			expect(recorded).toBeUndefined()
		}).pipe(Effect.scoped)
	)
})
