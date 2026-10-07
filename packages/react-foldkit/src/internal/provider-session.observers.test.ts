import { it } from "@effect/vitest"
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Option, Result } from "effect"
import { expect, vi } from "vitest"
import { entry, fakeSource, Message } from "../../test/fixtures/commit-source"
import { CommitSourceError } from "../commitSource"
import { CommitError } from "../store"
import * as Connection from "./commit-source"
import * as Session from "./provider-session"
import * as ReactStore from "./react-store"

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

const duplicate = (key: string) => Cause.fail(new CommitSourceError({ reason: "DuplicateKey", key }))

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
		yield* Effect.promise(() =>
			vi.waitFor(
				function () {
					expect(interrupted).toBe(3)
				},
				{ timeout: 10_000 }
			)
		)
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
		expect(f.store.commit(Message.Edited())).toEqual(Result.fail(new CommitError({ reason: "Inactive" })))
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
