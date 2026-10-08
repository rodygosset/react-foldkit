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
		yield* store.activate
		const projected = ModelSource.projectOptional(
			{
				getSnapshot: store.getModel,
				getServerSnapshot: store.getServerModel,
				subscribe: store.subscribe,
				dispatch: store.dispatch,
			},
			{ read: (model) => model, toParentMessage: (message: Option.Option<number>) => message }
		)
		const source = Option.getOrThrow(projected.source())
		Result.getOrThrow(store.commit(Option.some(2)))
		expect(source.getSnapshot()).toBe(2)
		expect(source.getServerSnapshot()).toBe(1)
		Result.getOrThrow(store.commit(Option.none()))
		expect(projected.presence.getSnapshot()).toBe(false)
		expect(source.getSnapshot()).toBe(2)
		expect(source.getServerSnapshot()).toBe(1)
	})
)

it("constructs optional sources only after presence and retains live and server models separately", function () {
	let current = Option.none<number>()
	const projected = ModelSource.projectOptional(
		{
			getSnapshot: () => current,
			getServerSnapshot: () => Option.none<number>(),
			subscribe: () => function () {},
			dispatch() {},
		},
		{ read: (model) => model, toParentMessage: (message: number) => message }
	)
	expect(projected.source()).toEqual(Option.none())
	expect(projected.presence.getSnapshot()).toBe(false)
	current = Option.some(1)
	const source = Option.getOrThrow(projected.source())
	expect(projected.source()).toBe(projected.source())
	expect(source.getSnapshot()).toBe(1)
	expect(source.getServerSnapshot()).toBe(1)
	current = Option.some(2)
	expect(source.getSnapshot()).toBe(2)
	current = Option.none()
	expect(projected.presence.getSnapshot()).toBe(false)
	expect(source.getSnapshot()).toBe(2)
	expect(source.getServerSnapshot()).toBe(1)
})

it("stabilize keeps the wrapper reference while the Model is unchanged", function () {
	let model: { count: number } = { count: 0 }
	const read = ModelSource.stabilize(Option.some, () => model)
	const first = read()
	expect(read()).toBe(first)
	model = { count: 1 }
	expect(read()).not.toBe(first)
	expect(read()).toEqual(Option.some({ count: 1 }))
	expect(read()).toBe(read())
})
