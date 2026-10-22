import { ValueMessage, setValue } from "../test/fixtures/valueMessage"
import { it } from "@effect/vitest"
import { Effect, Option, Schema, SubscriptionRef } from "effect"
import type { DevToolsConfig } from "foldkit/runtime"
import { describe, expect } from "vitest"
import * as ReactStore from "./application/reactStore"
import * as Overlay from "./devtoolsOverlay"
import type { DevToolsStore } from "foldkit/devtools-host"
import { dispatchRequest } from "./devtoolsVendor/devTools/webSocketBridge.js"
import type * as Update from "foldkit/update"

const makeHarness = (config: Exclude<DevToolsConfig, boolean> = {}, commands: Update.Commands<ValueMessage> = []) =>
	Effect.gen(function* () {
		let history: DevToolsStore | undefined
		yield* Effect.acquireRelease(
			Effect.sync(() =>
				Overlay.__configure(
					(store) =>
						Effect.sync(function () {
							history = store
						}),
					undefined
				)
			),
			(dispose) => Effect.sync(dispose)
		)
		const store = ReactStore.make<number, ValueMessage>(
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
			store.commit(setValue(5))
			yield* history.clear
			expect(yield* history.getModelAtIndex(-1)).toBe(5)
			expect(SubscriptionRef.getUnsafe(history.stateRef).entries).toEqual([])
			expect(SubscriptionRef.getUnsafe(history.stateRef).initCommands).toEqual([])
			store.commit(setValue(1))
			store.commit(setValue(1))
			yield* history.jumpTo(0)
			expect(store.getDisplayModel()).toBe(6)
			expect(store.getModel()).toBe(7)
			yield* history.clear
			expect(store.getDisplayModel()).toBe(6)
			expect(SubscriptionRef.getUnsafe(history.stateRef).entries).toHaveLength(2)
			yield* history.resume
			expect(store.getDisplayModel()).toBe(7)
		}).pipe(Effect.scoped)
	)

	it.live("records tagged Messages and replays their original payload", () =>
		Effect.gen(function* () {
			const { store, history } = yield* makeHarness()
			store.commit(setValue(2))
			store.commit(setValue(3))
			const state = SubscriptionRef.getUnsafe(history.stateRef)
			expect(state.entries.map(({ tag }) => tag)).toEqual(["SetValue", "SetValue"])
			expect(yield* history.getMessageAtIndex(0)).toEqual(Option.some(setValue(2)))
			yield* history.jumpTo(0)
			expect(store.getDisplayModel()).toBe(2)
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

	it.live.each([{ maxEntries: 20 }, { maxEntries: 20, keyframeInterval: 100 }, { keyframeInterval: 200 }])(
		"keeps every retained entry readable after eviction with %j",
		(config) =>
			Effect.gen(function* () {
				const { store, history } = yield* makeHarness(config)
				for (let index = 0; index < 123; index++) store.commit(setValue(1))
				const state = SubscriptionRef.getUnsafe(history.stateRef)
				expect(state.entries.length).toBeGreaterThan(0)
				expect(state.entries.length).toBeLessThanOrEqual(config.maxEntries ?? 100)
				for (let offset = 0; offset < state.entries.length; offset++) {
					const index = state.startIndex + offset
					expect(yield* history.getModelAtIndex(index)).toBe(index + 1)
				}
				yield* history.jumpTo(state.startIndex)
				expect(store.getDisplayModel()).toBe(state.startIndex + 1)
				yield* history.resume
				expect(store.getDisplayModel()).toBe(123)
			}).pipe(Effect.scoped)
	)
})
