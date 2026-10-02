// @vitest-environment node

import { expect, it } from "@effect/vitest"
import { Effect, Option, Result } from "effect"
import * as ModelSource from "./model-source"
import * as ReactStore from "./react-store"

it.effect("server reads cannot replace an optional source's last live snapshot", () =>
	Effect.gen(function* () {
		const store = ReactStore.make(
			{ update: (_model: Option.Option<number>, message: Option.Option<number>) => ({ model: message }) },
			{ model: Option.some(1) }
		)
		yield* Effect.acquireRelease(store.activate, (deactivate) => deactivate)
		const projected = ModelSource.projectOptional(
			{
				getSnapshot: store.getModel,
				getServerSnapshot: store.getServerModel,
				subscribe: store.subscribe,
				dispatch: store.dispatch,
			},
			{ read: (model) => model, toParentMessage: (message: Option.Option<number>) => message }
		)
		const source = Option.getOrThrow(projected.source)
		Result.getOrThrow(store.commit(Option.some(2)))
		expect(source.getSnapshot()).toBe(2)
		expect(source.getServerSnapshot()).toBe(1)
		Result.getOrThrow(store.commit(Option.none()))
		expect(projected.presence.getSnapshot()).toBe(false)
		expect(source.getSnapshot()).toBe(2)
		expect(source.getServerSnapshot()).toBe(1)
	})
)
