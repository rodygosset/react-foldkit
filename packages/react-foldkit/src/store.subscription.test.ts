import { it } from "@effect/vitest"
import { Array, Effect, Queue, Schema, Stream } from "effect"
import { afterEach, describe, expect, vi } from "vitest"
import { modifyFields } from "./struct"
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
	Emitted: { seq: Schema.Finite },
})
type Message = typeof Message.Type

const Model = Schema.Struct({
	enabled: Schema.Boolean,
	unrelated: Schema.Finite,
	emissions: Schema.Array(Schema.Finite),
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
		Enabled: () => ({ model: modifyFields(model, { enabled: () => true }) }),
		Disabled: () => ({ model: modifyFields(model, { enabled: () => false }) }),
		BumpedUnrelated: () => ({ model: modifyFields(model, { unrelated: (unrelated) => unrelated + 1 }) }),
		Emitted: ({ seq }) => ({
			model: modifyFields(model, { emissions: (emissions) => Array.append(emissions, seq) }),
		}),
	})

describe("subscriptions", function () {
	it.live("starts from init deps with zero dispatches", () =>
		Effect.gen(function* () {
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
				yield* Effect.promise(() =>
					vi.waitFor(function () {
						expect(active.current).toBe(true)
						expect(acquires.count).toBe(1)
						expect(store.getModel().emissions.length).toBeGreaterThan(0)
					})
				)
			} finally {
				yield* store.dispose()
			}
		})
	)

	it.live("starts the stream when the gate becomes true", () =>
		Effect.gen(function* () {
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

				yield* Effect.promise(() =>
					vi.waitFor(function () {
						expect(active.current).toBe(true)
						expect(store.getModel().emissions.length).toBeGreaterThan(0)
					})
				)
				expect(acquires.count).toBe(1)
			} finally {
				yield* store.dispose()
			}
		})
	)

	it.live("stops the stream when the gate becomes false", () =>
		Effect.gen(function* () {
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
				yield* Effect.promise(() =>
					vi.waitFor(function () {
						expect(active.current).toBe(true)
					})
				)

				store.dispatch(Message.Disabled())

				yield* Effect.promise(() =>
					vi.waitFor(function () {
						expect(active.current).toBe(false)
					})
				)
				expect(releases.count).toBeGreaterThanOrEqual(1)
			} finally {
				yield* store.dispose()
			}
		})
	)

	it.live("restarts across disable → enable", () =>
		Effect.gen(function* () {
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
				yield* Effect.promise(() =>
					vi.waitFor(function () {
						expect(active.current).toBe(true)
					})
				)
				const firstEmissions = store.getModel().emissions.length

				store.dispatch(Message.Disabled())
				yield* Effect.promise(() =>
					vi.waitFor(function () {
						expect(active.current).toBe(false)
					})
				)

				store.dispatch(Message.Enabled())
				yield* Effect.promise(() =>
					vi.waitFor(function () {
						expect(active.current).toBe(true)
						expect(store.getModel().emissions.length).toBeGreaterThan(firstEmissions)
					})
				)
				expect(acquires.count).toBe(2)
			} finally {
				yield* store.dispose()
			}
		})
	)

	it.live("does not restart when only unrelated model fields change", () =>
		Effect.gen(function* () {
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
				yield* Effect.promise(() =>
					vi.waitFor(function () {
						expect(active.current).toBe(true)
						expect(acquires.count).toBe(1)
					})
				)

				store.dispatch(Message.BumpedUnrelated())
				store.dispatch(Message.BumpedUnrelated())

				yield* Effect.sleep("30 millis")

				expect(acquires.count).toBe(1)
				expect(releases.count).toBe(0)
				expect(active.current).toBe(true)
				expect(store.getModel().unrelated).toBe(2)
			} finally {
				yield* store.dispose()
			}
		})
	)

	it.live("dispose tears down an active subscription stream", () =>
		Effect.gen(function* () {
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

			yield* Effect.promise(() =>
				vi.waitFor(function () {
					expect(active.current).toBe(true)
				})
			)

			yield* store.dispose()

			yield* Effect.promise(() =>
				vi.waitFor(function () {
					expect(active.current).toBe(false)
				})
			)
			expect(releases.count).toBeGreaterThanOrEqual(1)
		})
	)
})
