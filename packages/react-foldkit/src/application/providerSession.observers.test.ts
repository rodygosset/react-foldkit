import { it } from "@effect/vitest"
import { Cause, Deferred, Effect, Exit, Fiber, Function, Layer, Logger, Option, Result } from "effect"
import { TestClock } from "effect/testing"
import { defineMessageUnion } from "foldkit/message"
import { expect } from "vitest"
import { makeLogCapture } from "../../test/fixtures/logCapture"
import { CommitError, Inactive } from "../store"
import * as Session from "./providerSession"
import * as ReactStore from "./reactStore"

const Message = defineMessageUnion({ Edited: {} })
type Message = typeof Message.Type

function fixture() {
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
	const bootstrap: Session.Bootstrap<number, Message> = { store }
	return { handled, store, bootstrap }
}

function crashingFixture(defect: Error) {
	const store = ReactStore.make<number, Message>(
		{
			update() {
				throw defect
			},
			onCrash() {},
		},
		{ model: 0 }
	)
	const bootstrap: Session.Bootstrap<number, Message> = { store }
	return { store, bootstrap }
}

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

it.effect("combines setup failure with asynchronous cleanup before observing it", () =>
	Effect.gen(function* () {
		const f = fixture()
		const gate = yield* Deferred.make<void>()
		const observed = yield* Deferred.make<void>()
		const failure = new Error("setup failure")
		const defect = new Error("asynchronous setup cleanup")
		const bootstrap: Session.Bootstrap<number, Message> = {
			...f.bootstrap,
			store: {
				...f.store,
				activate: f.store.activate.pipe(
					Effect.tap(() =>
						Effect.addFinalizer(() => Deferred.await(gate).pipe(Effect.andThen(Effect.die(defect))))
					),
					Effect.andThen(Effect.die(failure))
				),
			},
		}
		const seen: Cause.Cause<unknown>[] = []
		const session = Session.make(Exit.succeed(bootstrap), function (cause) {
			seen.push(cause)
			return Deferred.succeed(observed, undefined)
		})
		yield* session.start
		expect(session.getSnapshot().cause).toEqual(Option.some(Cause.die(failure)))
		expect(seen).toEqual([])
		yield* Deferred.succeed(gate, undefined)
		yield* Deferred.await(observed)
		const combined = Cause.combine(Cause.die(failure), Cause.die(defect))
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
		const stopping = yield* Effect.forkChild(session.stop)
		yield* Deferred.succeed(cleanupGate, undefined)
		yield* Deferred.await(observed)
		expect(seen).toHaveLength(1)
		expect(Result.getOrThrow(Cause.findDefect(seen[0]!))).toBe(defect)
		expect(stopping.pollUnsafe()).toBeUndefined()
		yield* Deferred.succeed(observerGate, undefined)
		expect(yield* Fiber.await(stopping)).toEqual(Exit.void)
		expect(f.store.commit(Message.Edited())).toEqual(Result.fail(new CommitError({ reason: new Inactive() })))
	})
)

it.effect("waits for a canceled observer's finalizer before stop completes", () =>
	Effect.gen(function* () {
		const defect = new Error("canceled observer crash")
		const f = crashingFixture(defect)
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
		f.store.dispatch(Message.Edited())
		const stopping = yield* Effect.forkChild(session.stop)
		yield* Deferred.await(finalizing)
		expect(stopping.pollUnsafe()).toBeUndefined()
		expect(seen).toEqual([Cause.die(defect)])
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
				resources: Layer.effectDiscard(
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
				resources: Layer.effectDiscard(
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
		const seen: Cause.Cause<unknown>[] = []
		const session = Session.make(Exit.succeed({ store }), function (cause) {
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
		expect(session.getSnapshot().cause).toEqual(Option.none())
		yield* Deferred.succeed(cleanupGate, undefined)
		yield* Deferred.await(observed)
		expect(session.getSnapshot().cause).toEqual(Option.none())
		store.dispatch(Message.Edited())
		expect(store.getModel()).toBe(1)
		expect(session.getSnapshot().cause).toEqual(Option.none())
		yield* Deferred.succeed(observerGate, undefined)
		expect(yield* Fiber.await(stopping)).toEqual(Exit.void)
		expect(session.getSnapshot().cause).toEqual(Option.none())
		expect(seen).toEqual([Cause.die(cleanupDefect)])
		yield* session.stop
		expect(releases).toBe(2)
	})
)

it.effect("reports a terminal crash once in the start context and interrupts it on stop", () =>
	Effect.gen(function* () {
		const defect = new Error("terminal update crash")
		const f = crashingFixture(defect)
		const interrupted = yield* Deferred.make<void>()
		const seen: Cause.Cause<unknown>[] = []
		const logged: unknown[] = []
		const logger = Logger.make(function (options) {
			logged.push(options.message)
		})
		const session = Session.make(Exit.succeed(f.bootstrap), function (cause) {
			seen.push(cause)
			return Effect.logInfo("terminal-context").pipe(
				Effect.andThen(Effect.never),
				Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined))
			)
		})
		yield* session.start.pipe(Effect.provide(Logger.layer([logger])))
		f.store.dispatch(Message.Edited())
		f.store.dispatch(Message.Edited())
		const terminal = Option.getOrThrow(f.store.getCrash())
		expect(terminal).toEqual(Cause.die(defect))
		expect(session.getSnapshot().cause).toEqual(Option.some(terminal))
		expect(seen).toEqual([terminal])
		expect(seen[0]).toBe(terminal)
		expect(logged).toEqual([["terminal-context"]])
		yield* session.stop
		expect(yield* Deferred.isDone(interrupted)).toBe(true)
	})
)

it.effect("preserves the start logger for live and shutdown observers", () =>
	Effect.gen(function* () {
		const f = crashingFixture(new Error("live crash"))
		const logged: unknown[] = []
		const logger = Logger.make(function (options) {
			logged.push(options.message)
		})
		const reported = yield* Deferred.make<void>()
		const bootstrap: Session.Bootstrap<number, Message> = {
			store: {
				...f.store,
				activate: f.store.activate.pipe(
					Effect.tap(() => Effect.addFinalizer(() => Effect.die(new Error("cleanup failure"))))
				),
			},
		}
		const session = Session.make(Exit.succeed(bootstrap), () =>
			Effect.logInfo("observer-context").pipe(Effect.andThen(Deferred.succeed(reported, undefined)))
		)
		yield* session.start.pipe(Effect.provide(Logger.layer([logger])))
		f.store.dispatch(Message.Edited())
		yield* Deferred.await(reported)
		yield* session.stop
		expect(logged.filter((message) => Array.isArray(message) && message[0] === "observer-context")).toEqual([
			["observer-context"],
			["observer-context"],
		])
		expect(Option.isSome(session.getSnapshot().cause)).toBe(true)
	})
)

// A terminal crash report skips the transient report limit so it always runs. It still needs a
// deadline, or a stalled `crash.report` keeps its fiber alive until the Provider unmounts.
it.effect("interrupts a stalled terminal crash report after its deadline", () =>
	Effect.gen(function* () {
		const f = fixture()
		const interrupted = yield* Deferred.make<void>()
		const store = ReactStore.make<number, Message>(
			{
				update() {
					throw new Error("update failed")
				},
				onCrash: Function.constVoid,
			},
			{ model: 0 }
		)
		const session = Session.make(Exit.succeed({ ...f.bootstrap, store }), () =>
			Effect.never.pipe(Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined)))
		)
		yield* session.start
		store.dispatch(Message.Edited())

		yield* TestClock.adjust("2 seconds")

		expect(yield* Deferred.isDone(interrupted)).toBe(true)
		yield* session.stop
	})
)

// `crash.report` failures never reach the crash view, so the log is the only place they show up.
it.effect("logs a failing report", () =>
	Effect.gen(function* () {
		const f = crashingFixture(new Error("update failed"))
		const reportDefect = new Error("report failed")
		const logs = makeLogCapture()
		const session = Session.make(Exit.succeed(f.bootstrap), () => Effect.die(reportDefect))
		yield* session.start.pipe(Effect.provide(logs.layer))

		f.store.dispatch(Message.Edited())
		yield* Effect.yieldNow

		expect(logs.causes()).toEqual([Cause.die(reportDefect)])
		yield* session.stop
	})
)

// Cleanup failures during shutdown go to the crash view and to `crash.report`. The log keeps a
// record when the report itself is missing or fails.
it.effect("logs a cleanup failure when the session stops", () =>
	Effect.gen(function* () {
		const f = fixture()
		const cleanupDefect = new Error("cleanup failed")
		const logs = makeLogCapture()
		const bootstrap: Session.Bootstrap<number, Message> = {
			store: {
				...f.store,
				activate: f.store.activate.pipe(Effect.tap(() => Effect.addFinalizer(() => Effect.die(cleanupDefect)))),
			},
		}
		const session = Session.make(Exit.succeed(bootstrap), () => Effect.void)
		yield* session.start.pipe(Effect.provide(logs.layer))

		yield* session.stop

		expect(logs.causes().map(Cause.squash)).toEqual([cleanupDefect])
	})
)

// `stop` can run again while the first shutdown is still releasing resources. The second call
// must wait for that shutdown to finish, so no caller sees a stopped session that still holds
// resources.
it.effect("makes a concurrent stop wait for the running shutdown", () =>
	Effect.gen(function* () {
		const f = fixture()
		const releasing = yield* Deferred.make<void>()
		const finishRelease = yield* Deferred.make<void>()
		const bootstrap: Session.Bootstrap<number, Message> = {
			...f.bootstrap,
			store: {
				...f.store,
				activate: f.store.activate.pipe(
					Effect.tap(() =>
						Effect.addFinalizer(() =>
							Deferred.succeed(releasing, undefined).pipe(Effect.andThen(Deferred.await(finishRelease)))
						)
					)
				),
			},
		}
		const session = Session.make(Exit.succeed(bootstrap), () => Effect.void)
		yield* session.start

		const first = yield* Effect.forkChild(session.stop)
		yield* Deferred.await(releasing)
		const second = yield* Effect.forkChild(session.stop, { startImmediately: true })
		yield* Effect.yieldNow

		expect(second.pollUnsafe()).toBeUndefined()
		yield* Deferred.succeed(finishRelease, undefined)
		expect(yield* Fiber.await(first)).toEqual(Exit.void)
		expect(yield* Fiber.await(second)).toEqual(Exit.void)
	})
)

// When setup fails, the resources it acquired close with that failure. Finalizers that
// distinguish success from failure, such as a transaction that rolls back, depend on it.
it.effect("gives setup finalizers the setup failure", () =>
	Effect.gen(function* () {
		const f = fixture()
		const failure = new Error("setup failure")
		const released = yield* Deferred.make<Exit.Exit<unknown, unknown>>()
		const bootstrap: Session.Bootstrap<number, Message> = {
			...f.bootstrap,
			store: {
				...f.store,
				activate: f.store.activate.pipe(
					Effect.tap(() => Effect.addFinalizer((exit) => Deferred.succeed(released, exit))),
					Effect.andThen(Effect.die(failure))
				),
			},
		}
		const session = Session.make(Exit.succeed(bootstrap), () => Effect.void)

		yield* session.start

		expect(yield* Deferred.await(released)).toEqual(Exit.die(failure))
		yield* session.stop
	})
)
