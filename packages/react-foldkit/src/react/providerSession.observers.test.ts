import { it } from "@effect/vitest"
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Logger, Option, Result } from "effect"
import { TestClock } from "effect/testing"
import { expect } from "vitest"
import { entry, fakeSource, Message } from "../../test/fixtures/commitSource"
import { CommitSourceError } from "../commitSource"
import * as Connection from "../commitSource/connection"
import { CommitError } from "../store"
import * as Session from "./providerSession"
import * as ReactStore from "./reactStore"

function fixture() {
	const source = fakeSource<Message>()
	const handled: Message[] = []
	const store = ReactStore.make<number, Message>(
		{
			update(model, message) {
				handled.push(message)
				return { model: model + 1 }
			},
		},
		{ model: 0 }
	)
	const connection = Result.getOrThrow(Connection.make({ source: source.source, initialSnapshot: [] }))
	const bootstrap: Session.Bootstrap<number, Message> = { store, connection }
	return { source, handled, store, bootstrap }
}

const duplicate = (key: string) => Cause.fail(new CommitSourceError({ details: { reason: "DuplicateKey", key } }))

it.effect("publishes bootstrap failure before its observer settles and keeps it when the observer fails", () =>
	Effect.gen(function* () {
		const failure = new Error("bootstrap failure")
		const observerFailure = new Error("async observer failure")
		const gate = yield* Deferred.make<void>()
		const started = yield* Deferred.make<void>()
		const seen: Cause.Cause<unknown>[] = []
		const session = Session.make<number, Message>(Exit.fail(failure), function (cause) {
			seen.push(cause)
			return Deferred.succeed(started, undefined).pipe(
				Effect.andThen(Deferred.await(gate)),
				Effect.andThen(Effect.fail(observerFailure))
			)
		})
		yield* session.start
		yield* Deferred.await(started)
		expect(session.getServerSnapshot().cause).toEqual(Option.some(Cause.fail(failure)))
		expect(session.getSnapshot().cause).toEqual(Option.some(Cause.fail(failure)))
		expect(seen).toEqual([Cause.fail(failure)])
		yield* Deferred.succeed(gate, undefined)
		yield* session.stop
		expect(session.getSnapshot().cause).toEqual(Option.some(Cause.fail(failure)))
	})
)

it.effect("interrupts a suspended bootstrap observer when its lifetime stops", () =>
	Effect.gen(function* () {
		const failure = new Error("bootstrap failure")
		const interrupted = yield* Deferred.make<void>()
		const seen: Cause.Cause<unknown>[] = []
		const session = Session.make<number, Message>(Exit.fail(failure), function (cause) {
			seen.push(cause)
			return Effect.never.pipe(Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined)))
		})
		yield* session.start
		expect(session.getSnapshot().cause).toEqual(Option.some(Cause.fail(failure)))
		yield* session.stop
		expect(yield* Deferred.isDone(interrupted)).toBe(true)
		expect(seen).toEqual([Cause.fail(failure)])
	})
)

it.effect("keeps a newer source success after an older asynchronous observer fails", () =>
	Effect.gen(function* () {
		const f = fixture()
		const gate = yield* Deferred.make<void>()
		const completed = yield* Deferred.make<void>()
		const seen: Cause.Cause<unknown>[] = []
		const session = Session.make(Exit.succeed(f.bootstrap), function (cause) {
			seen.push(cause)
			return Deferred.await(gate).pipe(
				Effect.andThen(Effect.die(new Error("old observer defect"))),
				Effect.onExit(() => Deferred.succeed(completed, undefined))
			)
		})
		yield* session.start
		f.source.publish([entry("a", 1), entry("a", 2)])
		expect(session.getSnapshot().cause).toEqual(Option.some(duplicate("a")))
		f.source.publish([entry("a", 1)])
		expect(f.store.getModel()).toBe(1)
		yield* Deferred.succeed(gate, undefined)
		yield* Deferred.await(completed)
		expect(session.getSnapshot().cause).toEqual(Option.none())
		expect(seen).toEqual([duplicate("a")])
		expect(f.handled).toEqual([Message.Received({ value: "a" })])
		yield* session.stop
	})
)

it.effect("keeps the latest source failure when an older asynchronous observer finishes", () =>
	Effect.gen(function* () {
		const f = fixture()
		const gate = yield* Deferred.make<void>()
		const completed = yield* Deferred.make<void>()
		const firstDefect = new Error("first observer defect")
		const secondDefect = new Error("second observer defect")
		const seen: Cause.Cause<unknown>[] = []
		const session = Session.make(Exit.succeed(f.bootstrap), function (cause) {
			seen.push(cause)
			return seen.length === 1
				? Deferred.await(gate).pipe(
						Effect.andThen(Effect.die(firstDefect)),
						Effect.onExit(() => Deferred.succeed(completed, undefined))
					)
				: Effect.die(secondDefect)
		})
		yield* session.start
		f.source.publish([entry("a", 1), entry("a", 2)])
		f.source.publish([entry("b", 1), entry("b", 2)])
		const latest = Option.some(duplicate("b"))
		expect(session.getSnapshot().cause).toEqual(latest)
		yield* Deferred.succeed(gate, undefined)
		yield* Deferred.await(completed)
		expect(session.getSnapshot().cause).toEqual(latest)
		expect(seen).toEqual([duplicate("a"), duplicate("b")])
		yield* session.stop
	})
)

it.effect("bounds repeated stalled observers by deadline while the session stays healthy", () =>
	Effect.gen(function* () {
		const f = fixture()
		const seen: Cause.Cause<unknown>[] = []
		let interrupted = 0
		const session = Session.make(Exit.succeed(f.bootstrap), function (cause) {
			seen.push(cause)
			return Effect.never.pipe(
				Effect.onInterrupt(() =>
					Effect.sync(function () {
						interrupted += 1
					})
				)
			)
		})
		yield* session.start
		f.source.publish([entry("a", 1), entry("a", 2)])
		f.source.publish([entry("b", 1), entry("b", 2)])
		f.source.publish([entry("c", 1), entry("c", 2)])
		expect(session.getSnapshot().cause).toEqual(Option.some(duplicate("c")))
		expect(seen).toEqual([duplicate("a"), duplicate("b"), duplicate("c")])
		yield* TestClock.adjust("2 seconds")
		expect(interrupted).toBe(3)
		f.source.publish([entry("a", 1)])
		expect(f.handled).toEqual([Message.Received({ value: "a" })])
		expect(session.getSnapshot().cause).toEqual(Option.none())
		yield* session.stop
		expect(f.source.listeners).toBe(0)
	})
)

it.effect("combines setup failure with asynchronous cleanup before observing it", () =>
	Effect.gen(function* () {
		const f = fixture()
		const gate = yield* Deferred.make<void>()
		const observed = yield* Deferred.make<void>()
		const defect = new Error("asynchronous setup cleanup")
		const bootstrap: Session.Bootstrap<number, Message> = {
			...f.bootstrap,
			store: {
				...f.store,
				activate: f.store.activate.pipe(
					Effect.tap(() =>
						Effect.addFinalizer(() => Deferred.await(gate).pipe(Effect.andThen(Effect.die(defect))))
					)
				),
			},
		}
		f.source.onSubscribe(() => f.source.publish([entry("a", 1), entry("a", 2)]))
		const seen: Cause.Cause<unknown>[] = []
		const session = Session.make(Exit.succeed(bootstrap), function (cause) {
			seen.push(cause)
			return Deferred.succeed(observed, undefined)
		})
		yield* session.start
		expect(session.getSnapshot().cause).toEqual(Option.some(duplicate("a")))
		expect(seen).toEqual([])
		expect(f.source.listeners).toBe(0)
		yield* Deferred.succeed(gate, undefined)
		yield* Deferred.await(observed)
		const combined = Cause.combine(duplicate("a"), Cause.die(defect))
		expect(seen).toEqual([combined])
		expect(session.getSnapshot().cause).toEqual(Option.some(combined))
		yield* session.stop
	})
)

it.effect("reports asynchronous cleanup when stop interrupts pending activation", () =>
	Effect.gen(function* () {
		const f = fixture()
		const cleanupGate = yield* Deferred.make<void>()
		const observerGate = yield* Deferred.make<void>()
		const acquired = yield* Deferred.make<void>()
		const observed = yield* Deferred.make<void>()
		const defect = new Error("pending setup cleanup defect")
		const bootstrap: Session.Bootstrap<number, Message> = {
			...f.bootstrap,
			store: {
				...f.store,
				activate: f.store.activate.pipe(
					Effect.tap(() =>
						Effect.addFinalizer(() => Deferred.await(cleanupGate).pipe(Effect.andThen(Effect.die(defect))))
					),
					Effect.tap(() => Deferred.succeed(acquired, undefined)),
					Effect.andThen(Effect.never)
				),
			},
		}
		const seen: Cause.Cause<unknown>[] = []
		const session = Session.make(Exit.succeed(bootstrap), function (cause) {
			seen.push(cause)
			return Deferred.succeed(observed, undefined).pipe(Effect.andThen(Deferred.await(observerGate)))
		})
		yield* session.start
		yield* Deferred.await(acquired)
		expect(f.store.commit(Message.Edited())).toEqual(Result.void)
		expect(f.source.listeners).toBe(0)
		const stopping = yield* Effect.forkChild(session.stop)
		yield* Deferred.succeed(cleanupGate, undefined)
		yield* Deferred.await(observed)
		expect(seen).toHaveLength(1)
		expect(Result.getOrThrow(Cause.findDefect(seen[0]!))).toBe(defect)
		expect(stopping.pollUnsafe()).toBeUndefined()
		yield* Deferred.succeed(observerGate, undefined)
		expect(yield* Fiber.await(stopping)).toEqual(Exit.void)
		expect(f.store.commit(Message.Edited())).toEqual(
			Result.fail(new CommitError({ details: { reason: "Inactive" } }))
		)
	})
)

it.effect("disconnects the source while a canceled observer awaits its finalizer", () =>
	Effect.gen(function* () {
		const f = fixture()
		const gate = yield* Deferred.make<void>()
		const finalizing = yield* Deferred.make<void>()
		const seen: Cause.Cause<unknown>[] = []
		const session = Session.make(Exit.succeed(f.bootstrap), function (cause) {
			seen.push(cause)
			return Effect.never.pipe(
				Effect.onInterrupt(() =>
					Deferred.succeed(finalizing, undefined).pipe(Effect.andThen(Deferred.await(gate)))
				)
			)
		})
		yield* session.start
		f.source.publish([entry("a", 1), entry("a", 2)])
		const stopping = yield* Effect.forkChild(session.stop)
		yield* Deferred.await(finalizing)
		expect(f.source.listeners).toBe(0)
		expect(stopping.pollUnsafe()).toBeUndefined()
		f.source.publish([entry("b", 1)])
		expect(f.handled).toEqual([])
		expect(seen).toEqual([duplicate("a")])
		yield* Deferred.succeed(gate, undefined)
		expect(yield* Fiber.await(stopping)).toEqual(Exit.void)
	})
)

it.effect("closes store resources before cleanup observation and awaits both", () =>
	Effect.gen(function* () {
		const cleanupGate = yield* Deferred.make<void>()
		const observerGate = yield* Deferred.make<void>()
		const acquired = yield* Deferred.make<void>()
		const released = yield* Deferred.make<void>()
		const observed = yield* Deferred.make<void>()
		const defect = new Error("asynchronous cleanup")
		const events: string[] = []
		const store = ReactStore.make<number, Message>(
			{
				update: (model) => ({ model }),
				layer: Layer.effectDiscard(
					Effect.acquireRelease(Deferred.succeed(acquired, undefined), () =>
						Deferred.succeed(released, undefined).pipe(
							Effect.andThen(Deferred.await(cleanupGate)),
							Effect.andThen(Effect.sync(() => events.push("resource closed"))),
							Effect.andThen(Effect.die(defect))
						)
					)
				),
			},
			{ model: 0, commands: [{ name: "Acquire", effect: Effect.never }] }
		)
		const seen: Cause.Cause<unknown>[] = []
		const session = Session.make(Exit.succeed({ store }), function (cause) {
			seen.push(cause)
			events.push("observer started")
			return Deferred.succeed(observed, undefined).pipe(Effect.andThen(Deferred.await(observerGate)))
		})
		yield* session.start
		yield* Deferred.await(acquired)
		const stopping = yield* Effect.forkChild(session.stop)
		yield* Deferred.await(released)
		expect(seen).toEqual([])
		yield* Deferred.succeed(cleanupGate, undefined)
		yield* Deferred.await(observed)
		expect(events).toEqual(["resource closed", "observer started"])
		expect(seen).toEqual([Cause.die(defect)])
		expect(session.getSnapshot().cause).toEqual(Option.some(Cause.die(defect)))
		expect(stopping.pollUnsafe()).toBeUndefined()
		yield* Deferred.succeed(observerGate, undefined)
		expect(yield* Fiber.await(stopping)).toEqual(Exit.void)
	})
)

it.effect("keeps a healthy reconnect after an older cleanup observer fails", () =>
	Effect.gen(function* () {
		const source = fakeSource<Message>()
		const cleanupGate = yield* Deferred.make<void>()
		const observerGate = yield* Deferred.make<void>()
		const firstAcquired = yield* Deferred.make<void>()
		const secondAcquired = yield* Deferred.make<void>()
		const firstReleased = yield* Deferred.make<void>()
		const observed = yield* Deferred.make<void>()
		const cleanupDefect = new Error("old cleanup defect")
		const observerDefect = new Error("old cleanup observer defect")
		let acquisitions = 0
		let releases = 0
		const store = ReactStore.make<number, Message>(
			{
				update: (model) => ({ model: model + 1 }),
				layer: Layer.effectDiscard(
					Effect.acquireRelease(
						Effect.suspend(() =>
							Deferred.succeed(++acquisitions === 1 ? firstAcquired : secondAcquired, undefined)
						),
						() =>
							Effect.suspend(() =>
								++releases === 1
									? Deferred.succeed(firstReleased, undefined).pipe(
											Effect.andThen(Deferred.await(cleanupGate)),
											Effect.andThen(Effect.die(cleanupDefect))
										)
									: Effect.void
							)
					)
				),
			},
			{ model: 0, commands: [{ name: "Acquire", effect: Effect.never }] }
		)
		const connection = Result.getOrThrow(Connection.make({ source: source.source, initialSnapshot: [] }))
		const seen: Cause.Cause<unknown>[] = []
		const session = Session.make(Exit.succeed({ store, connection }), function (cause) {
			seen.push(cause)
			return Deferred.succeed(observed, undefined).pipe(
				Effect.andThen(Deferred.await(observerGate)),
				Effect.andThen(Effect.die(observerDefect))
			)
		})
		yield* session.start
		yield* Deferred.await(firstAcquired)
		const stopping = yield* Effect.forkChild(session.stop)
		yield* Deferred.await(firstReleased)
		yield* session.start
		yield* Deferred.await(secondAcquired)
		yield* Effect.yieldNow
		expect(source.listeners).toBe(1)
		expect(session.getSnapshot().cause).toEqual(Option.none())
		yield* Deferred.succeed(cleanupGate, undefined)
		yield* Deferred.await(observed)
		expect(session.getSnapshot().cause).toEqual(Option.none())
		source.publish([entry("a", 1)])
		expect(store.getModel()).toBe(1)
		expect(source.listeners).toBe(1)
		expect(session.getSnapshot().cause).toEqual(Option.none())
		yield* Deferred.succeed(observerGate, undefined)
		expect(yield* Fiber.await(stopping)).toEqual(Exit.void)
		expect(session.getSnapshot().cause).toEqual(Option.none())
		expect(seen).toEqual([Cause.die(cleanupDefect)])
		yield* session.stop
		expect(releases).toBe(2)
	})
)

it.effect("drops overflow reports and releases capacity when observers finish", () =>
	Effect.gen(function* () {
		const f = fixture()
		const seen: Cause.Cause<unknown>[] = []
		const gate = yield* Deferred.make<void>()
		const drained = yield* Deferred.make<void>()
		let completed = 0
		const session = Session.make(Exit.succeed(f.bootstrap), function (cause) {
			seen.push(cause)
			return Deferred.await(gate).pipe(
				Effect.andThen(
					Effect.suspend(function () {
						completed += 1
						return completed === 4 ? Deferred.succeed(drained, undefined) : Effect.void
					})
				)
			)
		})
		yield* session.start
		for (let i = 0; i < 100; i++) f.source.publish([entry(String(i), 1), entry(String(i), 2)])
		expect(seen).toEqual([duplicate("0"), duplicate("1"), duplicate("2"), duplicate("3")])
		expect(session.getSnapshot().cause).toEqual(Option.some(duplicate("99")))
		yield* Deferred.succeed(gate, undefined)
		yield* Deferred.await(drained)
		yield* Effect.yieldNow
		expect(seen).toHaveLength(4)
		f.source.publish([entry("next", 1), entry("next", 2)])
		expect(seen).toEqual([duplicate("0"), duplicate("1"), duplicate("2"), duplicate("3"), duplicate("next")])
		yield* session.stop
	})
)

it.effect("reports a terminal crash through saturated observers and interrupts it on stop", () =>
	Effect.gen(function* () {
		const f = fixture()
		const defect = new Error("terminal update crash")
		const store = ReactStore.make<number, Message>(
			{
				update() {
					throw defect
				},
				onCrash() {},
			},
			{ model: 0 }
		)
		const gate = yield* Deferred.make<void>()
		const drained = yield* Deferred.make<void>()
		const interrupted = yield* Deferred.make<void>()
		const seen: Cause.Cause<unknown>[] = []
		const logged: unknown[] = []
		const logger = Logger.make(function (options) {
			logged.push(options.message)
		})
		let completed = 0
		const session = Session.make(Exit.succeed({ ...f.bootstrap, store }), function (cause) {
			seen.push(cause)
			if (Cause.hasDies(cause))
				return Effect.logInfo("terminal-context").pipe(
					Effect.andThen(Effect.never),
					Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined))
				)
			return Deferred.await(gate).pipe(
				Effect.andThen(
					Effect.suspend(function () {
						completed += 1
						return completed === 4 ? Deferred.succeed(drained, undefined) : Effect.void
					})
				)
			)
		})
		yield* session.start.pipe(Effect.provide(Logger.layer([logger])))
		for (let i = 0; i < 4; i++) f.source.publish([entry(String(i), 1), entry(String(i), 2)])
		expect(seen).toEqual([duplicate("0"), duplicate("1"), duplicate("2"), duplicate("3")])
		store.dispatch(Message.Edited())
		const terminal = Option.getOrThrow(store.getCrash())
		expect(terminal).toEqual(Cause.die(defect))
		expect(session.getSnapshot().cause).toEqual(Option.some(terminal))
		expect(seen).toHaveLength(5)
		expect(seen[4]).toBe(terminal)
		expect(logged).toEqual([["terminal-context"]])
		yield* Deferred.succeed(gate, undefined)
		yield* Deferred.await(drained)
		yield* Effect.yieldNow
		f.source.publish([])
		expect(session.getSnapshot().cause).toEqual(Option.some(terminal))
		expect(seen).toHaveLength(5)
		yield* session.stop
		expect(yield* Deferred.isDone(interrupted)).toBe(true)
		expect(f.source.listeners).toBe(0)
	})
)

it.effect("preserves the start logger for live and shutdown observers", () =>
	Effect.gen(function* () {
		const f = fixture()
		const logged: unknown[] = []
		const logger = Logger.make(function (options) {
			logged.push(options.message)
		})
		const reported = yield* Deferred.make<void>()
		const cleanupFailure = new Error("cleanup failure")
		f.source.onUnsubscribe(function () {
			throw cleanupFailure
		})
		const session = Session.make(Exit.succeed(f.bootstrap), () =>
			Effect.logInfo("observer-context").pipe(Effect.andThen(Deferred.succeed(reported, undefined)))
		)
		yield* session.start.pipe(Effect.provide(Logger.layer([logger])))
		f.source.publish([entry("a", 1), entry("a", 2)])
		yield* Deferred.await(reported)
		yield* session.stop
		expect(logged.filter((message) => Array.isArray(message) && message[0] === "observer-context")).toEqual([
			["observer-context"],
			["observer-context"],
		])
		expect(Option.isSome(session.getSnapshot().cause)).toBe(true)
		expect(f.source.listeners).toBe(0)
	})
)
