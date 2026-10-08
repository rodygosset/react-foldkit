import { Cause, Deferred, Effect, Exit, Fiber, Layer, Option, Schema, Stream } from "effect"
import { describe, expect } from "vitest"
import { it } from "@effect/vitest"
import * as Store from "./store"
import * as Subscription from "./subscription"

describe("store observers", function () {
	it.live("buffers every model while subscription resources are acquiring", () =>
		Effect.gen(function* () {
			const seen: number[] = []
			const acquiring = Deferred.makeUnsafe<void>()
			const ready = Deferred.makeUnsafe<void>()
			const consumed = Deferred.makeUnsafe<void>()
			const subscriptions = Subscription.make<number, number>()((entry) => ({
				watch: entry(
					{ value: Schema.Finite },
					{
						modelToDependencies(model) {
							seen.push(model)
							return { value: model }
						},
						dependenciesToStream: ({ value }) =>
							value === 2
								? Stream.fromEffect(Deferred.succeed(consumed, undefined)).pipe(Stream.drain)
								: Stream.empty,
					}
				),
			}))
			const store = Store.boot(
				{
					update: (_model: number, message: number) => ({ model: message }),
					subscriptions,
					layer: Layer.effectDiscard(
						Deferred.succeed(acquiring, undefined).pipe(Effect.andThen(Deferred.await(ready)))
					),
				},
				{ model: 0 }
			)
			try {
				yield* Deferred.await(acquiring)
				store.commit(1)
				store.commit(2)
				yield* Deferred.succeed(ready, undefined)
				yield* Deferred.await(consumed)
				expect(seen).toEqual([0, 1, 2])
			} finally {
				yield* store.dispose()
			}
		})
	)

	it.live.each([0, 1])("fails only the waiter when its predicate throws at model %i", (throwAt) =>
		Effect.gen(function* () {
			const defect = new Error("predicate failed")
			let picks = 0
			const store = Store.boot(
				{ update: (_model: number, message: number) => ({ model: message }) },
				{ model: 0 }
			)
			const waiter = yield* Effect.forkChild(
				Effect.exit(
					Store.takeWhen(store, function (model) {
						picks++
						if (model === throwAt) throw defect
						return Option.none()
					})
				),
				{ startImmediately: true }
			)
			try {
				store.commit(1)
				const result = yield* Fiber.join(waiter)
				expect(Exit.isFailure(result) && result.cause.reasons).toEqual(Cause.die(defect).reasons)
				store.commit(2)
				expect(picks).toBe(throwAt + 1)
				expect(store.getModel()).toBe(2)
				expect(store.getCrash()).toEqual(Option.none())
			} finally {
				yield* store.dispose()
			}
		})
	)

	it.live("settles all waiters and shares disposal defects after resource cleanup", () =>
		Effect.gen(function* () {
			const started = Deferred.makeUnsafe<void>()
			const closing = Deferred.makeUnsafe<void>()
			const release = Deferred.makeUnsafe<void>()
			const events: string[] = []
			const defects = [new Error("first observer"), new Error("second observer")]
			const layer = Layer.effectDiscard(
				Effect.acquireRelease(Deferred.succeed(started, undefined), () =>
					Deferred.succeed(closing, undefined).pipe(
						Effect.andThen(Deferred.await(release)),
						Effect.andThen(Effect.sync(() => events.push("released")))
					)
				)
			)
			const store = Store.boot(
				{ update: (_model: number, message: number) => ({ model: message }), layer },
				{ model: 0, commands: [{ name: "Wait", effect: Effect.never }] }
			)
			yield* Deferred.await(started)
			store.subscribe(function () {
				events.push("first")
				throw defects[0]
			})
			const firstWaiter = yield* Effect.forkChild(Effect.exit(Store.takeWhen(store, () => Option.none())), {
				startImmediately: true,
			})
			store.subscribe(function () {
				events.push("second")
				throw defects[1]
			})
			const secondWaiter = yield* Effect.forkChild(Effect.exit(Store.takeWhen(store, () => Option.none())), {
				startImmediately: true,
			})
			store.subscribe(() => events.push("last"))
			const firstDisposal = yield* Effect.forkChild(Effect.exit(store.dispose()))
			yield* Deferred.await(closing)
			const concurrentDisposal = yield* Effect.forkChild(Effect.exit(store.dispose()))
			yield* Deferred.succeed(release, undefined)
			const result = yield* Fiber.join(firstDisposal)
			expect(Exit.isFailure(result) && result.cause.reasons).toEqual(
				defects.flatMap((defect) => Cause.die(defect).reasons)
			)
			expect(yield* Fiber.join(concurrentDisposal)).toEqual(result)
			expect(yield* Effect.exit(store.dispose())).toEqual(result)
			for (const waiter of [firstWaiter, secondWaiter]) {
				const waiterResult = yield* Fiber.join(waiter)
				expect(Exit.isFailure(waiterResult) && waiterResult.cause.reasons).toEqual(
					Cause.fail(new Store.Disposed()).reasons
				)
			}
			expect(events).toEqual(["first", "second", "last", "released"])
			expect(store.isDisposed()).toBe(true)
		})
	)
})
