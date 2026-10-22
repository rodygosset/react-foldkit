import {
	Cause,
	Context,
	Deferred,
	Effect,
	Exit,
	Fiber,
	Function,
	Layer,
	Option,
	Result,
	Schema,
	Scope,
	Stream,
} from "effect"
import { ValueMessage, setValue } from "../test/fixtures/valueMessage"
import { describe, expect } from "vitest"
import { it } from "@effect/vitest"
import * as Store from "./store"
import * as Runtime from "./store/store"
import * as Subscription from "foldkit/subscription"
import { makeLogCapture } from "../test/fixtures/logCapture"

describe("store observers", function () {
	it.live("observer defects do not interrupt Message delivery", () =>
		Effect.gen(function* () {
			const command = { name: "Run", effect: Effect.never }
			const runtime = Runtime.makeRuntime(
				{ update: (model: number, message: ValueMessage) => ({ model: message.value, commands: [command] }) },
				0,
				{
					recordInit() {},
					recordMessage() {
						throw new Error("observer failed")
					},
					adoptCommand: (command) => command,
				}
			)
			const scope = yield* Scope.make()
			yield* runtime
				.activate({ context: Context.empty(), commands: [], firstMessage: Option.none() })
				.pipe(Scope.provide(scope))
			expect(runtime.commit(setValue(1))).toEqual(Result.void)
			expect(runtime.getModel()).toBe(1)
			expect(runtime.getRunningCommands()).toEqual([command])
			yield* Scope.close(scope, Exit.void)
		})
	)

	it.live("buffers every model while subscription resources are acquiring", () =>
		Effect.gen(function* () {
			const seen: number[] = []
			const acquiring = Deferred.makeUnsafe<void>()
			const ready = Deferred.makeUnsafe<void>()
			const consumed = Deferred.makeUnsafe<void>()
			const subscriptions = Subscription.make<number, ValueMessage>()((entry) => ({
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
					update: (_model: number, message: ValueMessage) => ({ model: message.value }),
					subscriptions,
					resources: Layer.effectDiscard(
						Deferred.succeed(acquiring, undefined).pipe(Effect.andThen(Deferred.await(ready)))
					),
				},
				{ model: 0 }
			)
			try {
				yield* Deferred.await(acquiring)
				store.commit(setValue(1))
				store.commit(setValue(2))
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
				{ update: (_model: number, message: ValueMessage) => ({ model: message.value }) },
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
				store.commit(setValue(1))
				const result = yield* Fiber.join(waiter)
				expect(Exit.isFailure(result) && result.cause.reasons).toEqual(Cause.die(defect).reasons)
				store.commit(setValue(2))
				expect(picks).toBe(throwAt + 1)
				expect(store.getModel()).toBe(2)
				expect(store.getCrash()).toEqual(Option.none())
			} finally {
				yield* store.dispose()
			}
		})
	)

	// `Program.onCrash` is application code. If it throws, React's crash listener must still run,
	// or the Provider never shows its crash view.
	it.effect("notifies crash listeners and logs the defect when onCrash throws", () =>
		Effect.gen(function* () {
			const updateDefect = new Error("update failed")
			const onCrashDefect = new Error("onCrash failed")
			const logs = makeLogCapture()
			const store = yield* Store.make<number, ValueMessage>(
				{
					update() {
						throw updateDefect
					},
					onCrash() {
						throw onCrashDefect
					},
				},
				{ model: 0 }
			).pipe(Effect.provide(logs.layer))
			let notified = false
			store.subscribeCrash(function () {
				notified = true
			})

			store.dispatch(setValue(1))
			yield* Effect.yieldNow

			expect(notified).toBe(true)
			expect(logs.causes()).toEqual([Cause.die(onCrashDefect)])
		})
	)

	// A crash listener can unsubscribe another listener while the Store notifies them.
	// Notification works from a copy of the listener set, so every listener registered at crash
	// time still runs once.
	it.effect("notifies every crash listener registered at crash time when one unsubscribes another", () =>
		Effect.gen(function* () {
			const store = yield* Store.make<number, ValueMessage>(
				{
					update() {
						throw new Error("update failed")
					},
					onCrash: Function.constVoid,
				},
				{ model: 0 }
			)
			const notified: Array<string> = []
			let unsubscribeSecond = Function.constVoid
			store.subscribeCrash(function () {
				notified.push("first")
				unsubscribeSecond()
			})
			unsubscribeSecond = store.subscribeCrash(function () {
				notified.push("second")
			})

			store.dispatch(setValue(1))

			expect(notified).toEqual(["first", "second"])
		})
	)

	// Without `onCrash`, the log is the only place a crash shows up outside React.
	it.effect("logs the crash Cause when the Program has no onCrash", () =>
		Effect.gen(function* () {
			const defect = new Error("update failed")
			const logs = makeLogCapture()
			const store = yield* Store.make<number, ValueMessage>(
				{
					update() {
						throw defect
					},
				},
				{ model: 0 }
			).pipe(Effect.provide(logs.layer))

			store.dispatch(setValue(1))
			yield* Effect.yieldNow

			expect(logs.entries.map(({ message }) => message)).toEqual([
				["[react-foldkit] Store crashed:", Cause.pretty(Cause.die(defect))],
			])
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
				{ update: (_model: number, message: ValueMessage) => ({ model: message.value }), resources: layer },
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
