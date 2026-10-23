import { it } from "@effect/vitest"
import { Effect, Exit, Option, Queue, Scope } from "effect"
import { TestClock } from "effect/testing"
import { expect } from "vitest"
import * as Engine from "../../test/fixtures/managedResource"
import * as ReactStore from "./reactStore"

it.effect("retains managed resources for quick reactivation and reacquires after the window", () =>
	Effect.scoped(
		Effect.gen(function* () {
			const acquisitions = yield* Queue.unbounded<string>()
			const releases = yield* Queue.unbounded<string>()
			let count = 0
			const program = Engine.make(
				() =>
					Effect.gen(function* () {
						const id = String(++count)
						yield* Queue.offer(acquisitions, id)
						return { id }
					}),
				({ id }) => Effect.asVoid(Queue.offer(releases, id)),
				Option.some("a")
			)
			const store = ReactStore.make({ ...program, retainInactive: "1 second" }, program.init())
			const first = yield* Scope.make()
			yield* store.activate.pipe(Scope.provide(first))
			expect(yield* Queue.take(acquisitions)).toBe("1")
			yield* Scope.close(first, Exit.void)
			yield* TestClock.adjust("500 millis")
			const second = yield* Scope.make()
			yield* store.activate.pipe(Scope.provide(second))
			expect(count).toBe(1)
			expect(yield* Queue.clear(releases)).toEqual([])
			yield* Scope.close(second, Exit.void)
			yield* TestClock.adjust("1 second")
			expect(yield* Queue.take(releases)).toBe("1")
			const third = yield* Scope.make()
			yield* store.activate.pipe(Scope.provide(third))
			expect(yield* Queue.take(acquisitions)).toBe("2")
			expect(store.getModel().requested).toEqual(Option.some("a"))
			yield* Scope.close(third, Exit.void)
			yield* TestClock.adjust("1 second")
			expect(yield* Queue.take(releases)).toBe("2")
		})
	)
)
