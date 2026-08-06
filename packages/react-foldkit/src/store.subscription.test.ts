import { Effect, Match, Queue, Schema, Stream } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"
import * as Command from "./command"
import { m } from "./message"
import * as Store from "./store"
import * as Subscription from "./subscription"
import type * as Update from "./update"

/**
 * Subscription lifecycle: start / stop / restart / equivalence / dispose.
 * Acquire/release counters mirror Foldkit embed.test stream tracking.
 */

const Enabled = m("Enabled")
const Disabled = m("Disabled")
const BumpedUnrelated = m("BumpedUnrelated")
const Emitted = m("Emitted", { seq: Schema.Number })

const Message = Schema.Union([Enabled, Disabled, BumpedUnrelated, Emitted])
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
									Queue.offerUnsafe(queue, Emitted({ seq }))
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
	Match.value(message).pipe(
		Match.withReturnType<UpdateReturn>(),
		Match.tagsExhaustive({
			Enabled: function () {
				return [{ ...model, enabled: true }, Command.none]
			},
			Disabled: function () {
				return [{ ...model, enabled: false }, Command.none]
			},
			BumpedUnrelated: function () {
				return [{ ...model, unrelated: model.unrelated + 1 }, Command.none]
			},
			Emitted: function ({ seq }) {
				return [{ ...model, emissions: [...model.emissions, seq] }, Command.none]
			},
		})
	)

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
			[{ enabled: true, unrelated: 0, emissions: [] }, []]
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
			[{ enabled: false, unrelated: 0, emissions: [] }, []]
		)

		try {
			expect(active.current).toBe(false)
			expect(acquires.count).toBe(0)

			store.dispatch(Enabled())

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
			[{ enabled: true, unrelated: 0, emissions: [] }, []]
		)

		try {
			await vi.waitFor(function () {
				expect(active.current).toBe(true)
			})

			store.dispatch(Disabled())

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
			[{ enabled: false, unrelated: 0, emissions: [] }, []]
		)

		try {
			store.dispatch(Enabled())
			await vi.waitFor(function () {
				expect(active.current).toBe(true)
			})
			const firstEmissions = store.getModel().emissions.length

			store.dispatch(Disabled())
			await vi.waitFor(function () {
				expect(active.current).toBe(false)
			})

			store.dispatch(Enabled())
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
			[{ enabled: true, unrelated: 0, emissions: [] }, []]
		)

		try {
			await vi.waitFor(function () {
				expect(active.current).toBe(true)
				expect(acquires.count).toBe(1)
			})

			store.dispatch(BumpedUnrelated())
			store.dispatch(BumpedUnrelated())

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
			[{ enabled: true, unrelated: 0, emissions: [] }, []]
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
