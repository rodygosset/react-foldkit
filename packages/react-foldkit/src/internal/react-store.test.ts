import { Effect, Latch, Layer, Schema, Stream } from "effect"
import { describe, expect, it, vi } from "vitest"
import type * as Command from "../command"
import { defineMessageUnion } from "../message"
import * as Subscription from "../subscription"
import type * as Update from "../update"
import * as ReactStore from "./react-store"

const Message = defineMessageUnion({
	CompletedInit: { value: Schema.String },
	SetValue: { value: Schema.String },
})
type Message = typeof Message.Type

const Model = Schema.Struct({ value: Schema.String })
type Model = typeof Model.Type

type UpdateReturn = Update.Return<Model, Message>

const update = (_model: Model, message: Message): UpdateReturn =>
	Message.match<UpdateReturn>(message, {
		CompletedInit: ({ value }) => ({ model: { value } }),
		SetValue: ({ value }) => ({ model: { value } }),
	})

const makeInitCommand = (effect: Effect.Effect<Message>): Command.Command<Message> => ({ name: "RunInit", effect })

describe("React store lifecycle", function () {
	it("drops dispatches while inactive and preserves the last live Model across reactivation", function () {
		const store = ReactStore.make({ update }, { model: { value: "initial" } })

		store.dispatch(Message.SetValue({ value: "before activation" }))
		expect(store.getModel()).toEqual({ value: "initial" })

		const deactivateFirst = store.activate()
		store.dispatch(Message.SetValue({ value: "live" }))
		expect(store.getModel()).toEqual({ value: "live" })
		deactivateFirst()

		store.dispatch(Message.SetValue({ value: "while inactive" }))
		const deactivateSecond = store.activate()
		expect(store.getModel()).toEqual({ value: "live" })
		deactivateSecond()
	})

	it("does not rerun an init Command after it has produced its result", async function () {
		let runs = 0
		const command = makeInitCommand(
			Effect.sync(function () {
				runs += 1
				return Message.CompletedInit({ value: "complete" })
			})
		)
		const store = ReactStore.make({ update }, { model: { value: "initial" }, commands: [command] })

		const deactivateFirst = store.activate()
		await vi.waitFor(function () {
			expect(store.getModel()).toEqual({ value: "complete" })
		})
		deactivateFirst()

		const deactivateSecond = store.activate()
		await new Promise<void>(function (resolve) {
			queueMicrotask(resolve)
		})
		expect(runs).toBe(1)
		expect(store.getModel()).toEqual({ value: "complete" })
		deactivateSecond()
	})

	it("restarts an interrupted init Command until it produces its result", async function () {
		const latch = Latch.makeUnsafe()
		let runs = 0
		const command = makeInitCommand(
			Effect.gen(function* () {
				runs += 1
				yield* latch.await
				return Message.CompletedInit({ value: "complete" })
			})
		)
		const store = ReactStore.make({ update }, { model: { value: "initial" }, commands: [command] })

		const deactivateFirst = store.activate()
		await vi.waitFor(function () {
			expect(runs).toBe(1)
		})
		deactivateFirst()

		const deactivateSecond = store.activate()
		await vi.waitFor(function () {
			expect(runs).toBe(2)
		})
		Effect.runSync(latch.open)
		await vi.waitFor(function () {
			expect(store.getModel()).toEqual({ value: "complete" })
		})
		deactivateSecond()

		const deactivateThird = store.activate()
		await new Promise<void>(function (resolve) {
			queueMicrotask(resolve)
		})
		expect(runs).toBe(2)
		deactivateThird()
	})

	it("reconnects Subscriptions and Layer resources on every activation", async function () {
		let acquires = 0
		let releases = 0
		const layer = Layer.effectDiscard(
			Effect.acquireRelease(
				Effect.sync(function () {
					acquires += 1
				}),
				() =>
					Effect.sync(function () {
						releases += 1
					})
			)
		)
		const subscriptions = Subscription.make<Model, Message>()((entry) => ({
			keepAlive: entry(
				{ value: Schema.String },
				{
					modelToDependencies: (model) => ({ value: model.value }),
					dependenciesToStream: () => Stream.never,
				}
			),
		}))
		const store = ReactStore.make({ update, subscriptions, layer }, { model: { value: "initial" } })

		const deactivateFirst = store.activate()
		await vi.waitFor(function () {
			expect(acquires).toBe(1)
		})
		deactivateFirst()
		await vi.waitFor(function () {
			expect(releases).toBe(1)
		})

		const deactivateSecond = store.activate()
		await vi.waitFor(function () {
			expect(acquires).toBe(2)
		})
		deactivateSecond()
		await vi.waitFor(function () {
			expect(releases).toBe(2)
		})
	})

	it("rejects overlapping activations", function () {
		const store = ReactStore.make({ update }, { model: { value: "initial" } })
		const deactivate = store.activate()

		try {
			expect(function () {
				store.activate()
			}).toThrow("react-foldkit store is already active")
		} finally {
			deactivate()
		}
	})
})
