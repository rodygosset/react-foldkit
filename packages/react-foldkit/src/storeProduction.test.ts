import { it } from "@effect/vitest"
import {
	Cause,
	Context,
	Crypto,
	Deferred,
	Effect,
	Exit,
	Fiber,
	Layer,
	Option,
	Result,
	Schema,
	Scope,
	Stream,
} from "effect"
import { expect } from "vitest"
import * as Connection from "./commitSource/connection"
import * as Loader from "./loader"
import * as ReactStore from "./react/reactStore"
import * as Store from "./store"
import * as Subscription from "./subscription"

it.live.each(["update", "command", "subscription"] as const)(
	"closes work and fails waiters after a %s crash",
	(origin) =>
		Effect.gen(function* () {
			const started = Deferred.makeUnsafe<void>()
			const crash = Deferred.makeUnsafe<void>()
			const released = Deferred.makeUnsafe<void>()
			const defect = new Error(origin)
			const events: string[] = []
			const failing = Deferred.await(crash).pipe(Effect.andThen(Effect.die(defect)))
			const subscriptions = Subscription.make<number, number>()((entry) => ({
				failure: entry(
					{},
					{
						modelToDependencies: () => ({}),
						dependenciesToStream: () =>
							origin === "subscription" ? Stream.fromEffect(failing) : Stream.empty,
					}
				),
			}))
			const store = Store.boot(
				{
					update(_model: number, message: number) {
						if (origin === "update" && message === 9) throw defect
						return { model: message }
					},
					subscriptions,
					onCrash() {},
					layer: Layer.effectDiscard(
						Effect.acquireRelease(Effect.void, () => Effect.sync(() => events.push("services")))
					),
				},
				{
					model: 0,
					commands: [
						{
							name: "Peer",
							effect: Effect.acquireUseRelease(
								Deferred.succeed(started, undefined),
								() => Effect.never,
								() =>
									Effect.sync(() => events.push("work")).pipe(
										Effect.andThen(Deferred.succeed(released, undefined))
									)
							),
						},
						...(origin === "command" ? [{ name: "Crash", effect: failing }] : []),
					],
				}
			)
			yield* Deferred.await(started)
			const waiter = yield* Effect.forkChild(
				Store.takeWhen(store, () => Option.none()),
				{ startImmediately: true }
			)
			if (origin === "update") store.commit(9)
			else yield* Deferred.succeed(crash, undefined)
			const error = yield* Effect.flip(Fiber.join(waiter))
			expect(error._tag).toBe("Crashed")
			if (error._tag !== "Crashed") return expect.fail("Expected Crashed")
			expect(Cause.squash(error.cause)).toBe(defect)
			expect(Option.getOrThrow(store.getCrash())).toBe(error.cause)
			yield* Deferred.await(released)
			yield* store.dispose()
			expect(events).toEqual(["work", "services"])
			store.dispatch(2)
			expect(store.getModel()).toBe(0)
			expect(Option.getOrThrow(store.getCrash())).toBe(error.cause)
		})
)

it.effect("uses ambient services without constructing another closed Layer", function () {
	class Counter extends Context.Service<Counter, number>()("AmbientCounter") {}
	return Effect.gen(function* () {
		const store = yield* Store.make(
			{ update: (_model: number, message: number) => ({ model: message }) },
			{
				model: 0,
				commands: [{ name: "Read", effect: Counter }],
			}
		)
		expect(yield* Store.takeWhen((n: number) => (n === 42 ? Option.some(n) : Option.none()))(store)).toBe(42)
		yield* Effect.yieldNow
		yield* Store.commit(43)(store)
		expect(store.getModel()).toBe(43)
	}).pipe(Effect.provideService(Counter, 42))
})

it.effect("retains delivered source versions when React model observers throw and reconnect", () =>
	Effect.gen(function* () {
		let snapshot: ReadonlyArray<{ key: string; version: number; message: number }> = []
		let publish = function () {}
		const source = {
			getSnapshot: () => Result.succeed(snapshot),
			subscribe(notify: () => void) {
				publish = notify
				return function () {
					publish = function () {}
				}
			},
		}
		const connection = Result.getOrThrow(Connection.make({ source, initialSnapshot: [] }))
		const store = ReactStore.make(
			{ update: (model: number, message: number) => ({ model: model + message }) },
			{ model: 0 }
		)
		let notifications = 0
		const unsubscribe = store.subscribe(function () {
			if (store.getModel() > 0) throw new Error("observer")
		})
		store.subscribe(function () {
			notifications++
		})
		const first = yield* Scope.make()
		yield* store.activate.pipe(Scope.provide(first))
		yield* connection
			.connect(store.commit, (exit) => expect(Exit.isSuccess(exit)).toBe(true))
			.pipe(Scope.provide(first))
		snapshot = [{ key: "one", version: 1, message: 1 }]
		publish()
		expect(store.getModel()).toBe(1)
		expect(notifications).toBe(2)
		expect(store.getCrash()).toEqual(Option.none())
		yield* Scope.close(first, Exit.void)
		const second = yield* Scope.make()
		yield* store.activate.pipe(Scope.provide(second))
		yield* connection.connect(store.commit, function () {}).pipe(Scope.provide(second))
		expect(store.getModel()).toBe(1)
		unsubscribe()
		yield* Scope.close(second, Exit.void)
	})
)

it.effect("uses caller Crypto for receipts without overriding the loading program's services", function () {
	const crypto = Crypto.make({
		randomBytes: (size) => new Uint8Array(size),
		digest: () => Effect.succeed(new Uint8Array()),
	})
	const loader = Loader.define({ name: "Deterministic", data: Schema.String, key: () => "one" })
	return Effect.gen(function* () {
		const expected = yield* crypto.randomUUIDv4
		const envelope = yield* loader.load(Effect.flatMap(Crypto.Crypto, (provided) => provided.randomUUIDv4))
		expect(envelope.version).toBe(expected)
		expect(envelope.payload).toBe(expected)
	}).pipe(Effect.provideService(Crypto.Crypto, crypto))
})

it.effect("snapshots observers so resubscription cannot repeat a notification in the same delivery", () =>
	Effect.gen(function* () {
		const store = yield* Store.make(
			{ update: (_model: number, message: number) => ({ model: message }) },
			{ model: 0 }
		)
		let notifications = 0
		let later = 0
		let unsubscribe = function () {}
		function observe(): void {
			notifications++
			unsubscribe()
			if (notifications < 3) unsubscribe = store.subscribe(observe)
		}
		unsubscribe = store.subscribe(observe)
		store.subscribe(() => later++)
		expect(store.commit(1)).toEqual(Result.void)
		expect({ notifications, later }).toEqual({ notifications: 1, later: 1 })
		unsubscribe()
	})
)
