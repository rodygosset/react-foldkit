// @vitest-environment node

import { expect, it } from "@effect/vitest"
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Logger, Option, Result, Stream } from "effect"
import { TestClock } from "effect/testing"
import * as Subscription from "foldkit/subscription"
import { Message } from "../../test/fixtures/message"
import * as Session from "./providerSession"
import * as ReactStore from "./reactStore"

for (const delivery of ["dispatch", "commit"] as const) {
	it.effect(`reports a ${delivery} crash once and keeps it after later deliveries`, () =>
		Effect.gen(function* () {
			const defect = new Error(delivery)
			const observed: Array<Cause.Cause<unknown>> = []
			const crashed: Array<Cause.Cause<unknown>> = []
			const store = ReactStore.make<number, Message>(
				{
					update(_model, message) {
						if (message.value === 9) throw defect
						return { model: message.value }
					},
					onCrash(cause) {
						crashed.push(cause)
					},
				},
				{ model: 0 }
			)
			const session = Session.make(Exit.succeed({ store }), (cause) =>
				Effect.sync(function () {
					observed.push(cause)
				})
			)
			yield* session.start
			if (delivery === "dispatch") store.dispatch(Message.SetValue({ value: 9 }))
			if (delivery === "commit") store.commit(Message.SetValue({ value: 9 }))
			store.dispatch(Message.SetValue({ value: 1 }))
			store.commit(Message.SetValue({ value: 1 }))
			expect(observed).toEqual([Cause.die(defect)])
			expect(crashed).toEqual([Cause.die(defect)])
			expect(session.getSnapshot().cause).toEqual(Option.some(Cause.die(defect)))
			expect(session.getServerSnapshot().cause).toEqual(Option.none())
			expect(store.getModel()).toBe(0)
			yield* session.stop
			expect(store.getCrash()).toEqual(Option.some(Cause.die(defect)))
		})
	)
}

for (const command of ["init", "update", "subscription"] as const) {
	it.effect(`reports a ${command} effect crash to the session and retains the original Cause`, () =>
		Effect.gen(function* () {
			const defect = new Error(command)
			const notified = Deferred.makeUnsafe<Cause.Cause<unknown>>()
			const crashed = Deferred.makeUnsafe<Cause.Cause<unknown>>()
			const failedCommand = { name: "Fail", effect: Effect.die(defect) }
			const subscriptions = Subscription.make<number, Message>()((entry) => ({
				failed: entry(
					{},
					{
						modelToDependencies: () => ({}),
						dependenciesToStream: () => Stream.die(defect),
					}
				),
			}))
			const store = ReactStore.make<number, Message>(
				{
					update: (_model, message) => ({
						model: message.value,
						commands: command === "update" ? [failedCommand] : [],
					}),
					...(command === "subscription" ? { subscriptions } : {}),
					onCrash(cause) {
						Deferred.doneUnsafe(crashed, Exit.succeed(cause))
					},
				},
				{ model: 0, commands: command === "init" ? [failedCommand] : [] }
			)
			const session = Session.make(Exit.succeed({ store }), (cause) => Deferred.succeed(notified, cause))
			yield* session.start
			if (command === "update") store.dispatch(Message.SetValue({ value: 1 }))
			const actual = yield* Deferred.await(notified)
			const configCause = yield* Deferred.await(crashed)
			expect(Result.getOrThrow(Cause.findDefect(actual))).toBe(defect)
			expect(Option.getOrThrow(store.getCrash())).toBe(actual)
			expect(configCause).toBe(actual)
			expect(Option.getOrThrow(session.getSnapshot().cause)).toBe(actual)
			yield* session.stop
		})
	)
}

it.effect("reports a startup subscription crash once", () =>
	Effect.gen(function* () {
		const defect = new Error("startup")
		const observations: Array<Cause.Cause<unknown>> = []
		const notified = Deferred.makeUnsafe<void>()
		const store = ReactStore.make<number, Message>(
			{
				update: (_model, message) => ({ model: message.value }),
				onCrash() {},
				subscriptions: Subscription.make<number, Message>()((entry) => ({
					fail: entry(
						{},
						{ modelToDependencies: () => ({}), dependenciesToStream: () => Stream.die(defect) }
					),
				})),
			},
			{ model: 0 }
		)
		const session = Session.make(Exit.succeed({ store }), (cause) =>
			Effect.sync(function () {
				observations.push(cause)
			}).pipe(Effect.andThen(Deferred.succeed(notified, undefined)))
		)
		yield* session.start
		yield* Deferred.await(notified)
		store.dispatch(Message.SetValue({ value: 2 }))
		expect(observations).toEqual([Cause.die(defect)])
		expect(session.getSnapshot().cause).toEqual(Option.some(Cause.die(defect)))
		yield* session.stop
	})
)

it.effect("a healthy replacement activation clears a terminal crash and ignores old observer completion", () =>
	Effect.gen(function* () {
		const defect = new Error("first activation")
		const observerStarted = Deferred.makeUnsafe<void>()
		const observerInterrupted = Deferred.makeUnsafe<void>()
		const observerGate = Deferred.makeUnsafe<void>()
		const store = ReactStore.make<number, Message>(
			{
				update(_model, message) {
					if (message.value === 9) throw defect
					return { model: message.value }
				},
				onCrash() {},
			},
			{ model: 0 }
		)
		const observations: Array<Cause.Cause<unknown>> = []
		const session = Session.make(Exit.succeed({ store }), (cause) =>
			Effect.gen(function* () {
				observations.push(cause)
				yield* Deferred.succeed(observerStarted, undefined)
				yield* Deferred.await(observerGate).pipe(
					Effect.onInterrupt(() => Deferred.succeed(observerInterrupted, undefined))
				)
				return yield* Effect.die("late observer")
			})
		)
		yield* session.start
		store.dispatch(Message.SetValue({ value: 9 }))
		yield* Deferred.await(observerStarted)
		expect(session.getSnapshot().cause).toEqual(Option.some(Cause.die(defect)))
		yield* session.stop
		yield* Deferred.await(observerInterrupted)
		yield* session.start
		expect(store.commit(Message.SetValue({ value: 2 }))).toEqual(Result.void)
		expect(store.getModel()).toBe(2)
		yield* Deferred.succeed(observerGate, undefined)
		expect(observations).toEqual([Cause.die(defect)])
		expect(session.getSnapshot().cause).toEqual(Option.none())
		yield* session.stop
	})
)

const cleanupStore = (acquired: Deferred.Deferred<void>, finalize: Effect.Effect<void>) =>
	ReactStore.make<number, Message>(
		{
			update: (_model, message) => ({ model: message.value }),
			resources: Layer.effectDiscard(Effect.acquireRelease(Effect.void, () => finalize)),
		},
		{
			model: 0,
			commands: [
				{
					name: "BuildResources",
					effect: Deferred.succeed(acquired, undefined).pipe(Effect.as(Message.SetValue({ value: 1 }))),
				},
			],
		}
	)

it.effect(
	"publishes cleanup failure after release, interrupts a never observer at five seconds, and shares repeated stop",
	() =>
		Effect.gen(function* () {
			const acquired = Deferred.makeUnsafe<void>()
			const started = Deferred.makeUnsafe<void>()
			const interrupted = Deferred.makeUnsafe<void>()
			const defect = new Error("cleanup")
			let released = 0
			let observations = 0
			const store = cleanupStore(
				acquired,
				Effect.sync(function () {
					released += 1
				}).pipe(Effect.andThen(Effect.die(defect)))
			)
			const session = Session.make(Exit.succeed({ store }), () =>
				Effect.gen(function* () {
					observations += 1
					expect(released).toBe(1)
					yield* Deferred.succeed(started, undefined)
					return yield* Effect.never.pipe(Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined)))
				})
			)
			yield* session.start
			yield* Deferred.await(acquired)
			const first = yield* Effect.forkChild(session.stop)
			yield* Deferred.await(started)
			const second = yield* Effect.forkChild(session.stop)
			expect(session.getSnapshot().cause).toEqual(Option.some(Cause.die(defect)))
			yield* TestClock.adjust("4999 millis")
			expect(first.pollUnsafe()).toBeUndefined()
			yield* TestClock.adjust("1 millis")
			yield* Deferred.await(interrupted)
			yield* Fiber.join(first)
			yield* Fiber.join(second)
			yield* session.stop
			expect({ released, observations }).toEqual({ released: 1, observations: 1 })
			expect(session.getSnapshot().cause).toEqual(Option.some(Cause.die(defect)))
		})
)

it.effect("protects resource release while a stop caller is interrupted, then interrupts its cleanup observer", () =>
	Effect.gen(function* () {
		const acquired = Deferred.makeUnsafe<void>()
		const releasing = Deferred.makeUnsafe<void>()
		const releaseGate = Deferred.makeUnsafe<void>()
		const observerStarted = Deferred.makeUnsafe<void>()
		const observerInterrupted = Deferred.makeUnsafe<void>()
		let released = 0
		const store = cleanupStore(
			acquired,
			Effect.gen(function* () {
				yield* Deferred.succeed(releasing, undefined)
				yield* Deferred.await(releaseGate)
				released += 1
				return yield* Effect.die("cleanup")
			})
		)
		const session = Session.make(Exit.succeed({ store }), () =>
			Effect.gen(function* () {
				yield* Deferred.succeed(observerStarted, undefined)
				return yield* Effect.never.pipe(
					Effect.onInterrupt(() => Deferred.succeed(observerInterrupted, undefined))
				)
			})
		)
		yield* session.start
		yield* Deferred.await(acquired)
		const stopping = yield* Effect.forkChild(session.stop)
		yield* Deferred.await(releasing)
		const interrupting = yield* Effect.forkChild(Fiber.interrupt(stopping))
		expect(released).toBe(0)
		yield* Deferred.succeed(releaseGate, undefined)
		yield* Fiber.join(interrupting)
		expect(released).toBe(1)
		expect(session.getSnapshot().cause).toEqual(Option.some(Cause.die("cleanup")))

		const secondAcquired = Deferred.makeUnsafe<void>()
		const secondObserverStarted = Deferred.makeUnsafe<void>()
		const secondObserverInterrupted = Deferred.makeUnsafe<void>()
		const secondStore = cleanupStore(secondAcquired, Effect.die("second cleanup"))
		const secondSession = Session.make(Exit.succeed({ store: secondStore }), () =>
			Effect.gen(function* () {
				yield* Deferred.succeed(secondObserverStarted, undefined)
				return yield* Effect.never.pipe(
					Effect.onInterrupt(() => Deferred.succeed(secondObserverInterrupted, undefined))
				)
			})
		)
		yield* secondSession.start
		yield* Deferred.await(secondAcquired)
		const secondStopping = yield* Effect.forkChild(secondSession.stop)
		yield* Deferred.await(secondObserverStarted)
		yield* Fiber.interrupt(secondStopping)
		yield* Deferred.await(secondObserverInterrupted)
		expect(secondSession.getSnapshot().cause).toEqual(Option.some(Cause.die("second cleanup")))
	})
)

it.effect("logs nonterminal setup cleanup failure once before observing the combined Cause", () =>
	Effect.gen(function* () {
		const failure = new Error("setup failure")
		const defect = new Error("setup cleanup")
		const original = ReactStore.make<number, Message>(
			{ update: (_model, message) => ({ model: message.value }) },
			{ model: 0 }
		)
		const store = {
			...original,
			activate: original.activate.pipe(
				Effect.andThen(Effect.addFinalizer(() => Effect.die(defect))),
				Effect.andThen(Effect.die(failure))
			),
		}
		const observed = Deferred.makeUnsafe<void>()
		const events: Array<{ kind: "log" | "observe"; cause: Cause.Cause<unknown> }> = []
		const logger = Logger.make(function (options) {
			events.push({ kind: "log", cause: options.cause })
		})
		const session = Session.make(Exit.succeed({ store }), (cause) =>
			Effect.sync(function () {
				events.push({ kind: "observe", cause })
			}).pipe(Effect.andThen(Deferred.succeed(observed, undefined)))
		)
		yield* Effect.gen(function* () {
			yield* session.start
			yield* Deferred.await(observed)
			yield* session.stop
			yield* session.stop
		}).pipe(Effect.provide(Logger.layer([logger])))
		const combined = Cause.combine(Cause.die(failure), Cause.die(defect))
		expect(events).toEqual([
			{ kind: "log", cause: Cause.die(defect) },
			{ kind: "observe", cause: combined },
		])
		expect(session.getSnapshot().cause).toEqual(Option.some(combined))
		expect(store.getCrash()).toEqual(Option.none())
	})
)

it.effect("replays failures published while readers were detached before a healthy reconnect clears them", () =>
	Effect.gen(function* () {
		const acquired = Deferred.makeUnsafe<void>()
		const defect = new Error("detached cleanup")
		const store = cleanupStore(acquired, Effect.die(defect))
		const session = Session.make(Exit.succeed({ store }), () => Effect.void)
		yield* session.start
		yield* Deferred.await(acquired)
		yield* session.stop
		const snapshots: Array<Option.Option<Cause.Cause<unknown>>> = []
		const unsubscribe = session.subscribe(function () {
			snapshots.push(session.getSnapshot().cause)
		})
		yield* session.start
		expect(snapshots).toEqual([Option.some(Cause.die(defect)), Option.none()])
		expect(store.commit(Message.SetValue({ value: 2 }))).toEqual(Result.void)
		expect(store.getModel()).toBe(2)
		unsubscribe()
		yield* session.stop
	})
)

it.effect.each([false, true])("reports a replacement callback failure after previous crash %s", (previousCrash) =>
	Effect.gen(function* () {
		const previous = new Error("previous update defect")
		const current = new Error("replacement callback defect")
		let shouldFail = true
		const store = ReactStore.make<number, Message>(
			{
				update(model, message) {
					if (message.value === 9) throw previous
					return { model: model + message.value }
				},
				onReactivate() {
					if (shouldFail) throw current
					return Message.SetValue({ value: 1 })
				},
				onCrash() {},
			},
			{ model: 0 }
		)
		const reports: Cause.Cause<unknown>[] = []
		const session = Session.make(Exit.succeed({ store }), (cause) =>
			Effect.sync(function () {
				reports.push(cause)
			})
		)
		yield* session.start
		if (previousCrash) store.dispatch(Message.SetValue({ value: 9 }))
		yield* session.stop
		expect(session.getSnapshot().cause).toEqual(previousCrash ? Option.some(Cause.die(previous)) : Option.none())
		expect(store.getCrash()).toEqual(previousCrash ? Option.some(Cause.die(previous)) : Option.none())
		yield* session.start
		expect(session.getSnapshot().cause).toEqual(Option.some(Cause.die(current)))
		const expected = previousCrash ? [Cause.die(previous), Cause.die(current)] : [Cause.die(current)]
		expect(reports).toEqual(expected)
		yield* session.stop
		yield* session.stop
		expect(reports).toEqual(expected)
		shouldFail = false
		yield* session.start
		expect(store.getModel()).toBe(1)
		expect(session.getSnapshot().cause).toEqual(Option.none())
		expect(reports).toEqual(expected)
		yield* session.stop
	})
)
