import { Effect, Queue, Schema, Stream } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"
import { defineMessageUnion } from "./message"
import * as Store from "./store"
import * as Subscription from "./subscription"
import type * as Update from "./update"

/**
 * Subscription lifecycle: start / stop / restart / equivalence / dispose.
 * Acquire/release counters mirror Foldkit embed.test stream tracking.
 */

const Message = defineMessageUnion({
	Enabled: {},
	Disabled: {},
	BumpedUnrelated: {},
	Emitted: { seq: Schema.Number },
})
type Message = typeof Message.Type

const Model = Schema.Struct({
	enabled: Schema.Boolean,
	unrelated: Schema.Number,
	emissions: Schema.Array(Schema.Number),
})
type Model = typeof Model.Type

type UpdateReturn = Update.Return<Model, Message>

afterEach(function () {
	vi.restoreAllMocks()
})

function makeTrackedSubscriptions(
	active: { current: boolean },
	acquires: { count: number },
	releases: { count: number }
) {
	let seq = 0
	return Subscription.make<Model, Message>()((entry) => ({
		gate: entry(
			{ enabled: Schema.Boolean },
			{
				modelToDependencies: (model) => ({ enabled: model.enabled }),
				dependenciesToStream({ enabled }) {
					if (!enabled) return Stream.empty
					return Stream.callback<Message>((queue) =>
						Effect.gen(function* () {
							yield* Effect.acquireRelease(
								Effect.sync(function () {
									acquires.count += 1
									active.current = true
									seq += 1
									Queue.offerUnsafe(queue, Message.Emitted({ seq }))
								}),
								() =>
									Effect.sync(function () {
										releases.count += 1
										active.current = false
									})
							)
							return yield* Effect.never
						})
					)
				},
			}
		),
	}))
}

const update = (model: Model, message: Message): UpdateReturn =>
	Message.match<UpdateReturn>(message, {
			Enabled: () => ({ model: { ...model, enabled: true } }),
			Disabled: () => ({ model: { ...model, enabled: false } }),
			BumpedUnrelated: () => ({ model: { ...model, unrelated: model.unrelated + 1 } }),
			Emitted: ({ seq }) => ({ model: { ...model, emissions: [...model.emissions, seq] } }),
		})

describe("subscriptions", function () {
	it("starts from init deps with zero dispatches", async function () {
		const active = { current: false }
		const acquires = { count: 0 }
		const releases = { count: 0 }

		const store = Store.boot(
			{
				update,
				subscriptions: makeTrackedSubscriptions(active, acquires, releases),
			},
			{ model: { enabled: true, unrelated: 0, emissions: [] } }
		)

		try {
			await vi.waitFor(function () {
				expect(active.current).toBe(true)
				expect(acquires.count).toBe(1)
				expect(store.getModel().emissions.length).toBeGreaterThan(0)
			})
		} finally {
			store.dispose()
		}
	})

	it("starts the stream when the gate becomes true", async function () {
		const active = { current: false }
		const acquires = { count: 0 }
		const releases = { count: 0 }

		const store = Store.boot(
			{
				update,
				subscriptions: makeTrackedSubscriptions(active, acquires, releases),
			},
			{ model: { enabled: false, unrelated: 0, emissions: [] } }
		)

		try {
			expect(active.current).toBe(false)
			expect(acquires.count).toBe(0)

			store.dispatch(Message.Enabled())

			await vi.waitFor(function () {
				expect(active.current).toBe(true)
				expect(store.getModel().emissions.length).toBeGreaterThan(0)
			})
			expect(acquires.count).toBe(1)
		} finally {
			store.dispose()
		}
	})

	it("stops the stream when the gate becomes false", async function () {
		const active = { current: false }
		const acquires = { count: 0 }
		const releases = { count: 0 }

		const store = Store.boot(
			{
				update,
				subscriptions: makeTrackedSubscriptions(active, acquires, releases),
			},
			{ model: { enabled: true, unrelated: 0, emissions: [] } }
		)

		try {
			await vi.waitFor(function () {
				expect(active.current).toBe(true)
			})

			store.dispatch(Message.Disabled())

			await vi.waitFor(function () {
				expect(active.current).toBe(false)
			})
			expect(releases.count).toBeGreaterThanOrEqual(1)
		} finally {
			store.dispose()
		}
	})

	it("restarts across disable → enable", async function () {
		const active = { current: false }
		const acquires = { count: 0 }
		const releases = { count: 0 }

		const store = Store.boot(
			{
				update,
				subscriptions: makeTrackedSubscriptions(active, acquires, releases),
			},
			{ model: { enabled: false, unrelated: 0, emissions: [] } }
		)

		try {
			store.dispatch(Message.Enabled())
			await vi.waitFor(function () {
				expect(active.current).toBe(true)
			})
			const firstEmissions = store.getModel().emissions.length

			store.dispatch(Message.Disabled())
			await vi.waitFor(function () {
				expect(active.current).toBe(false)
			})

			store.dispatch(Message.Enabled())
			await vi.waitFor(function () {
				expect(active.current).toBe(true)
				expect(store.getModel().emissions.length).toBeGreaterThan(firstEmissions)
			})
			expect(acquires.count).toBe(2)
		} finally {
			store.dispose()
		}
	})

	it("does not restart when only unrelated model fields change", async function () {
		const active = { current: false }
		const acquires = { count: 0 }
		const releases = { count: 0 }

		const store = Store.boot(
			{
				update,
				subscriptions: makeTrackedSubscriptions(active, acquires, releases),
			},
			{ model: { enabled: true, unrelated: 0, emissions: [] } }
		)

		try {
			await vi.waitFor(function () {
				expect(active.current).toBe(true)
				expect(acquires.count).toBe(1)
			})

			store.dispatch(Message.BumpedUnrelated())
			store.dispatch(Message.BumpedUnrelated())

			await new Promise<void>(function (resolve) {
				setTimeout(resolve, 30)
			})

			expect(acquires.count).toBe(1)
			expect(releases.count).toBe(0)
			expect(active.current).toBe(true)
			expect(store.getModel().unrelated).toBe(2)
		} finally {
			store.dispose()
		}
	})

	it("dispose tears down an active subscription stream", async function () {
		const active = { current: false }
		const acquires = { count: 0 }
		const releases = { count: 0 }

		const store = Store.boot(
			{
				update,
				subscriptions: makeTrackedSubscriptions(active, acquires, releases),
			},
			{ model: { enabled: true, unrelated: 0, emissions: [] } }
		)

		await vi.waitFor(function () {
			expect(active.current).toBe(true)
		})

		store.dispose()

		await vi.waitFor(function () {
			expect(active.current).toBe(false)
		})
		expect(releases.count).toBeGreaterThanOrEqual(1)
	})
})
