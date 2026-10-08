// @vitest-environment node

import { expect, it } from "@effect/vitest"
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Logger, Option, Result, Stream } from "effect"
import { TestClock } from "effect/testing"
import { CommitSourceError, type CommitEntry, type CommitSource } from "../commitSource"
import * as Connection from "../commitSource/connection"
import * as Subscription from "../subscription"
import * as Session from "./providerSession"
import * as ReactStore from "./reactStore"

function source() {
	let snapshot: Result.Result<ReadonlyArray<CommitEntry<number>>, string> = Result.succeed([])
	const listeners = new Set<() => void>()
	const source: CommitSource<number, string> = {
		getSnapshot: () => snapshot,
		subscribe(listener) {
			listeners.add(listener)
			return function () {
				listeners.delete(listener)
			}
		},
	}
	return {
		connection: Result.getOrThrow(Connection.make({ source, initialSnapshot: [] })),
		publish(entries: ReadonlyArray<CommitEntry<number>>) {
			snapshot = Result.succeed(entries)
			for (const listener of listeners) listener()
		},
	}
}

for (const delivery of ["dispatch", "commit", "source"] as const) {
	it.effect(`reports a ${delivery} crash once and keeps it after successful source reconciliation`, () =>
		Effect.gen(function* () {
			const defect = new Error(delivery)
			const observed: Array<Cause.Cause<unknown>> = []
			const crashed: Array<Cause.Cause<unknown>> = []
			const input = source()
			const store = ReactStore.make<number, number>(
				{
					update(_model, message) {
						if (message === 9) throw defect
						return { model: message }
					},
					onCrash(cause) {
						crashed.push(cause)
					},
				},
				{ model: 0 }
			)
			const session = Session.make(Exit.succeed({ store, connection: input.connection }), (cause) =>
				Effect.sync(function () {
					observed.push(cause)
				})
			)
			yield* session.start
			if (delivery === "dispatch") store.dispatch(9)
			if (delivery === "commit") store.commit(9)
			if (delivery === "source") input.publish([{ key: "a", version: 1, message: 9 }])
			input.publish([{ key: "b", version: 1, message: 1 }])
			input.publish([])
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
			const subscriptions = Subscription.make<number, number>()((entry) => ({
				failed: entry(
					{},
					{
						modelToDependencies: () => ({}),
						dependenciesToStream: () => Stream.die(defect),
					}
				),
			}))
			const store = ReactStore.make<number, number>(
				{
					update: (_model, message) => ({
						model: message,
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
			if (command === "update") store.dispatch(1)
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

it.effect(
	"replays a startup subscription crash before source connection without reporting its CommitError wrapper",
	() =>
		Effect.gen(function* () {
			const defect = new Error("startup")
			const input = source()
			input.publish([{ key: "initial", version: 1, message: 1 }])
			const observations: Array<Cause.Cause<unknown>> = []
			const notified = Deferred.makeUnsafe<void>()
			const store = ReactStore.make<number, number>(
				{
					update: (_model, message) => ({ model: message }),
					onCrash() {},
					subscriptions: Subscription.make<number, number>()((entry) => ({
						fail: entry(
							{},
							{ modelToDependencies: () => ({}), dependenciesToStream: () => Stream.die(defect) }
						),
					})),
				},
				{ model: 0 }
			)
			const session = Session.make(Exit.succeed({ store, connection: input.connection }), (cause) =>
				Effect.sync(function () {
					observations.push(cause)
				}).pipe(Effect.andThen(Deferred.succeed(notified, undefined)))
			)
			yield* session.start
			yield* Deferred.await(notified)
			input.publish([{ key: "next", version: 1, message: 2 }])
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
		const store = ReactStore.make<number, number>(
			{
				update(_model, message) {
					if (message === 9) throw defect
					return { model: message }
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
		store.dispatch(9)
		yield* Deferred.await(observerStarted)
		expect(session.getSnapshot().cause).toEqual(Option.some(Cause.die(defect)))
		yield* session.stop
		yield* Deferred.await(observerInterrupted)
		yield* session.start
		expect(store.commit(2)).toEqual(Result.void)
		expect(store.getModel()).toBe(2)
		yield* Deferred.succeed(observerGate, undefined)
		expect(observations).toEqual([Cause.die(defect)])
		expect(session.getSnapshot().cause).toEqual(Option.none())
		yield* session.stop
	})
)

const cleanupStore = (acquired: Deferred.Deferred<void>, finalize: Effect.Effect<void>) =>
	ReactStore.make<number, number>(
		{
			update: (_model, message) => ({ model: message }),
			layer: Layer.effectDiscard(Effect.acquireRelease(Effect.void, () => finalize)),
		},
		{
			model: 0,
			commands: [
				{
					name: "BuildResources",
					effect: Deferred.succeed(acquired, undefined).pipe(Effect.andThen(Effect.succeed(1))),
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

it.effect("reports independent cleanup defects during terminal source catchup without the CommitError wrapper", () =>
	Effect.gen(function* () {
		const acquired = Deferred.makeUnsafe<void>()
		const reported = Deferred.makeUnsafe<void>()
		const runtimeDefect = new Error("runtime crash")
		const cleanupDefect = new Error("cleanup defect")
		const input = source()
		input.publish([{ key: "catchup", version: 1, message: 9 }])
		const store = ReactStore.make<number, number>(
			{
				update() {
					throw runtimeDefect
				},
				onCrash() {},
				layer: Layer.effectDiscard(Effect.acquireRelease(Effect.void, () => Effect.die(cleanupDefect))),
			},
			{
				model: 0,
				commands: [
					{
						name: "Acquire",
						effect: Deferred.succeed(acquired, undefined).pipe(Effect.andThen(Effect.never)),
					},
				],
			}
		)
		const connection: Connection.Connection<number, string> = {
			...input.connection,
			connect: (commit, onReconcile) =>
				Deferred.await(acquired).pipe(Effect.andThen(input.connection.connect(commit, onReconcile))),
		}
		const observations: Array<Cause.Cause<unknown>> = []
		const session = Session.make(Exit.succeed({ store, connection }), (cause) =>
			Effect.gen(function* () {
				observations.push(cause)
				if (observations.length === 2) yield* Deferred.succeed(reported, undefined)
			})
		)
		yield* session.start
		yield* Deferred.await(reported)
		expect(observations).toEqual([
			Cause.die(runtimeDefect),
			Cause.combine(Cause.die(runtimeDefect), Cause.die(cleanupDefect)),
		])
		expect(session.getSnapshot().cause).toEqual(
			Option.some(Cause.combine(Cause.die(runtimeDefect), Cause.die(cleanupDefect)))
		)
		expect(Option.getOrThrow(store.getCrash())).toBe(observations[0])
		yield* session.stop
		expect(observations).toHaveLength(2)
	})
)

it.effect("logs nonterminal setup cleanup failure once before observing the combined Cause", () =>
	Effect.gen(function* () {
		const defect = new Error("setup cleanup")
		const input = source()
		input.publish([
			{ key: "duplicate", version: 1, message: 1 },
			{ key: "duplicate", version: 2, message: 2 },
		])
		const original = ReactStore.make<number, number>(
			{ update: (_model, message) => ({ model: message }) },
			{ model: 0 }
		)
		const store = {
			...original,
			activate: original.activate.pipe(Effect.andThen(Effect.addFinalizer(() => Effect.die(defect)))),
		}
		const observed = Deferred.makeUnsafe<void>()
		const events: Array<{ kind: "log" | "observe"; cause: Cause.Cause<unknown> }> = []
		const logger = Logger.make(function (options) {
			events.push({ kind: "log", cause: options.cause })
		})
		const session = Session.make(Exit.succeed({ store, connection: input.connection }), (cause) =>
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
		const combined = Cause.combine(
			Cause.fail(new CommitSourceError({ details: { reason: "DuplicateKey", key: "duplicate" } })),
			Cause.die(defect)
		)
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
		expect(store.commit(2)).toEqual(Result.void)
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
		const store = ReactStore.make<number, number>(
			{
				update(model, message) {
					if (message === 9) throw previous
					return { model: model + message }
				},
				onReactivate() {
					if (shouldFail) throw current
					return 1
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
		if (previousCrash) store.dispatch(9)
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
