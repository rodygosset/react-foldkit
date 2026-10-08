import { it } from "@effect/vitest"
import {
	Cause,
	Deferred,
	Effect,
	Exit,
	Fiber,
	Latch,
	Layer,
	Option,
	Result,
	Scheduler,
	Schema,
	Scope,
	Stream,
} from "effect"
import { describe, expect, vi } from "vitest"
import type * as Command from "../command"
import { defineMessageUnion } from "../message"
import * as Store from "../store"
import { CommitError } from "../store"
import { modifyFields } from "../struct"
import * as Subscription from "../subscription"
import type * as Update from "../update"
import * as ReactStore from "./reactStore"

/** Activation owns a Scope, so closing it is the whole deactivation story. */
function activate<Model, Message>(store: ReactStore.ReactStore<Model, Message>): () => void {
	const scope = Scope.makeUnsafe()
	Effect.runSync(store.activate.pipe(Scope.provide(scope)))
	return () => Effect.runSync(Scope.close(scope, Exit.void))
}

const Message = defineMessageUnion({
	CompletedInit: { value: Schema.String },
	SetValue: { value: Schema.String },
})
type Message = typeof Message.Type

const Model = Schema.Struct({ value: Schema.String })
type Model = typeof Model.Type

type UpdateReturn = Update.Return<Model, Message>

const update = (model: Model, message: Message): UpdateReturn =>
	Message.match<UpdateReturn>(message, {
		CompletedInit: ({ value }) => ({ model: modifyFields(model, { value: () => value }) }),
		SetValue: ({ value }) => ({ model: modifyFields(model, { value: () => value }) }),
	})

const makeInitCommand = (effect: Effect.Effect<Message>): Command.Command<Message> => ({ name: "RunInit", effect })

describe("React store lifecycle", function () {
	it.live("passes the final lease's failed Exit to resource finalizers", () =>
		Effect.asVoid(
			Effect.gen(function* () {
				const acquired = Deferred.makeUnsafe<void>()
				let resourceExit: Exit.Exit<unknown, unknown> | undefined
				const scope = yield* Scope.make()
				const store = ReactStore.make<number, number>(
					{
						update: (_model, message) => ({ model: message }),
						layer: Layer.effectDiscard(
							Effect.acquireRelease(Deferred.succeed(acquired, undefined), (_resource, exit) =>
								Effect.sync(function () {
									resourceExit = exit
								})
							)
						),
					},
					{ model: 0, commands: [{ name: "Started", effect: Effect.succeed(1) }] }
				)
				yield* store.activate.pipe(Scope.provide(scope))
				yield* Deferred.await(acquired)
				const exit = Exit.fail("setup failure")
				yield* Scope.close(scope, exit)
				expect(resourceExit).toEqual(exit)
			})
		)
	)
	it("rejects inactive commits, drops inactive dispatches, and preserves the Model across reactivation", function () {
		const store = ReactStore.make({ update }, { model: { value: "initial" } })

		expect(store.commit(Message.SetValue({ value: "before activation" }))).toEqual(
			Result.fail(new CommitError({ details: { reason: "Inactive" } }))
		)
		store.dispatch(Message.SetValue({ value: "before activation" }))
		expect(store.getModel()).toEqual({ value: "initial" })

		const deactivateFirst = activate(store)
		Result.getOrThrow(store.commit(Message.SetValue({ value: "live" })))
		expect(store.getModel()).toEqual({ value: "live" })
		deactivateFirst()

		expect(store.commit(Message.SetValue({ value: "while inactive" }))).toEqual(
			Result.fail(new CommitError({ details: { reason: "Inactive" } }))
		)
		store.dispatch(Message.SetValue({ value: "while inactive" }))
		const deactivateSecond = activate(store)
		expect(store.getModel()).toEqual({ value: "live" })
		deactivateSecond()
	})

	it("ignores stale and repeated cleanup calls without deactivating a newer lifetime", function () {
		const store = ReactStore.make({ update }, { model: { value: "initial" } })
		const deactivateFirst = activate(store)
		deactivateFirst()
		const deactivateSecond = activate(store)

		// Cleanup captured by the first lifetime must not release the second one.
		deactivateFirst()
		Result.getOrThrow(store.commit(Message.SetValue({ value: "new lifetime" })))
		expect(store.getModel()).toEqual({ value: "new lifetime" })
		deactivateSecond()
		deactivateFirst()
		deactivateSecond()
		expect(store.getModel()).toEqual({ value: "new lifetime" })
		expect(store.commit(Message.SetValue({ value: "after cleanup" }))).toEqual(
			Result.fail(new CommitError({ details: { reason: "Inactive" } }))
		)
	})

	it.live("does not rerun an init Command after it has produced its result", () =>
		Effect.gen(function* () {
			let runs = 0
			const command = makeInitCommand(
				Effect.sync(function () {
					runs += 1
					return Message.CompletedInit({ value: "complete" })
				})
			)
			const store = ReactStore.make({ update }, { model: { value: "initial" }, commands: [command] })

			const deactivateFirst = activate(store)
			yield* Effect.promise(() =>
				vi.waitFor(function () {
					expect(store.getModel()).toEqual({ value: "complete" })
				})
			)
			deactivateFirst()

			const deactivateSecond = activate(store)
			yield* Effect.yieldNow
			expect(runs).toBe(1)
			expect(store.getModel()).toEqual({ value: "complete" })
			deactivateSecond()
		})
	)

	it.live("retries an init result discarded before the deferred drain processes it", () =>
		Effect.gen(function* () {
			let now = 0
			const clock = vi.spyOn(performance, "now").mockImplementation(() => now)
			vi.stubGlobal(
				"MessageChannel",
				class {
					port1 = { postMessage() {}, close() {} }
					port2 = { onmessage: undefined, close() {} }
				}
			)
			try {
				yield* Effect.gen(function* () {
					const started = yield* Deferred.make<void>()
					const ready = yield* Deferred.make<void>()
					let runs = 0
					const command = Effect.gen(function* () {
						runs += 1
						yield* Deferred.succeed(started, undefined)
						yield* Deferred.await(ready)
						return 99
					})
					const store = ReactStore.make<number, number>(
						{
							update(_model, message) {
								if (message === 1) now += 6
								return { model: message }
							},
						},
						{ model: 0, commands: [{ name: "Init", effect: command }] }
					)
					const first = yield* Scope.fork(yield* Scope.Scope)
					yield* store.activate.pipe(Scope.provide(first))
					yield* Deferred.await(started)
					store.dispatch(1)
					yield* Deferred.succeed(ready, undefined)
					yield* Effect.yieldNow
					expect(store.getModel()).toBe(1)
					yield* Scope.close(first, Exit.void)
					yield* store.activate
					yield* Effect.yieldNow
					expect(runs).toBe(2)
					expect(store.getModel()).toBe(99)
				}).pipe(Effect.scoped)
			} finally {
				clock.mockRestore()
				vi.unstubAllGlobals()
			}
		})
	)

	it.live("restarts an interrupted init Command until it produces its result", () =>
		Effect.gen(function* () {
			const latch = Latch.makeUnsafe()
			let runs = 0
			const command = makeInitCommand(
				Effect.gen(function* () {
					runs += 1
					yield* latch.await
					return Message.CompletedInit({ value: "complete" })
				})
			)
			const store = ReactStore.make({ update }, { model: { value: "initial" }, commands: [command] })

			const deactivateFirst = activate(store)
			yield* Effect.promise(() =>
				vi.waitFor(function () {
					expect(runs).toBe(1)
				})
			)
			deactivateFirst()

			const deactivateSecond = activate(store)
			yield* Effect.promise(() =>
				vi.waitFor(function () {
					expect(runs).toBe(2)
				})
			)
			yield* latch.open
			yield* Effect.promise(() =>
				vi.waitFor(function () {
					expect(store.getModel()).toEqual({ value: "complete" })
				})
			)
			deactivateSecond()

			const deactivateThird = activate(store)
			yield* Effect.yieldNow
			expect(runs).toBe(2)
			deactivateThird()
		})
	)

	it.live("reconnects Subscriptions and Layer resources on every activation", () =>
		Effect.gen(function* () {
			let acquires = 0
			let releases = 0
			const layer = Layer.effectDiscard(
				Effect.acquireRelease(
					Effect.sync(function () {
						acquires += 1
					}),
					() =>
						Effect.sync(function () {
							releases += 1
						})
				)
			)
			const subscriptions = Subscription.make<Model, Message>()((entry) => ({
				keepAlive: entry(
					{ value: Schema.String },
					{
						modelToDependencies: (model) => ({ value: model.value }),
						dependenciesToStream: () => Stream.never,
					}
				),
			}))
			const store = ReactStore.make({ update, subscriptions, layer }, { model: { value: "initial" } })

			const deactivateFirst = activate(store)
			yield* Effect.promise(() =>
				vi.waitFor(function () {
					expect(acquires).toBe(1)
				})
			)
			deactivateFirst()
			yield* Effect.promise(() =>
				vi.waitFor(function () {
					expect(releases).toBe(1)
				})
			)

			const deactivateSecond = activate(store)
			yield* Effect.promise(() =>
				vi.waitFor(function () {
					expect(acquires).toBe(2)
				})
			)
			deactivateSecond()
			yield* Effect.promise(() =>
				vi.waitFor(function () {
					expect(releases).toBe(2)
				})
			)
		})
	)

	it("shares overlapping activation leases and releases each once", function () {
		const store = ReactStore.make({ update }, { model: { value: "initial" } })
		const first = activate(store)
		const second = activate(store)
		first()
		first()
		expect(store.commit(Message.SetValue({ value: "still active" }))).toEqual(Result.void)
		expect(store.getModel()).toEqual({ value: "still active" })
		second()
		second()
		expect(store.commit(Message.SetValue({ value: "inactive" }))).toEqual(
			Result.fail(new Store.CommitError({ details: { reason: "Inactive" } }))
		)
	})
})

describe("activation leases", function () {
	it.live(
		"shares one live store across concurrent acquisition and retains its subscription until the last lease",
		() =>
			Effect.gen(function* () {
				let acquires = 0
				let releases = 0
				const built = Latch.makeUnsafe()
				const notifications = vi.fn()
				const store = ReactStore.make(
					{
						update,
						layer: Layer.effectDiscard(
							Effect.acquireRelease(
								Effect.sync(function () {
									acquires += 1
								}).pipe(Effect.andThen(built.open)),
								() =>
									Effect.sync(function () {
										releases += 1
									})
							)
						),
					},
					{
						model: { value: "initial" },
						commands: [makeInitCommand(Effect.succeed(Message.CompletedInit({ value: "ready" })))],
					}
				)
				const unsubscribe = store.subscribe(notifications)
				yield* Effect.gen(function* () {
					const first = yield* Scope.make()
					const second = yield* Scope.make()
					try {
						// Force a yield during allocation, before either lease can publish its store.
						yield* Effect.all(
							[store.activate.pipe(Scope.provide(first)), store.activate.pipe(Scope.provide(second))],
							{ concurrency: "unbounded" }
						).pipe(Effect.provideService(Scheduler.MaxOpsBeforeYield, 8))
						yield* built.await
						yield* Effect.promise(() =>
							vi.waitFor(() => expect(store.getModel()).toEqual({ value: "ready" }))
						)
						yield* Scope.close(first, Exit.void)
						expect(acquires).toBe(1)
						expect(releases).toBe(0)
						notifications.mockClear()
						expect(store.commit(Message.SetValue({ value: "second lease" }))).toEqual(Result.void)
						expect(notifications).toHaveBeenCalledOnce()
						yield* Scope.close(second, Exit.void)
						expect(releases).toBe(1)
					} finally {
						yield* Scope.close(first, Exit.void)
						yield* Scope.close(second, Exit.void)
						unsubscribe()
					}
				})
			})
	)

	it.live("disposes the store only after the last overlapping lease closes", () =>
		Effect.gen(function* () {
			let releases = 0
			// A Subscription forces the Layer to build, so its release proves the store's own scope closed.
			const subscriptions = Subscription.make<Model, Message>()((entry) => ({
				keepAlive: entry(
					{ value: Schema.String },
					{
						modelToDependencies: (model) => ({ value: model.value }),
						dependenciesToStream: () => Stream.never,
					}
				),
			}))
			const store = ReactStore.make(
				{
					update,
					subscriptions,
					layer: Layer.effectDiscard(
						Effect.acquireRelease(Effect.void, () =>
							Effect.sync(function () {
								releases += 1
							})
						)
					),
				},
				{ model: { value: "initial" } }
			)
			const first = activate(store)
			const second = activate(store)
			Result.getOrThrow(store.commit(Message.SetValue({ value: "live" })))
			yield* Effect.promise(() =>
				vi.waitFor(function () {
					expect(store.getModel()).toEqual({ value: "live" })
				})
			)
			first()
			yield* Effect.sleep("20 millis")
			expect(releases).toBe(0)
			second()
			yield* Effect.promise(() =>
				vi.waitFor(function () {
					expect(releases).toBe(1)
				})
			)
		})
	)

	it("retains the Model from the ended activation for the next one", function () {
		const store = ReactStore.make({ update }, { model: { value: "initial" } })
		const first = activate(store)
		Result.getOrThrow(store.commit(Message.SetValue({ value: "carried" })))
		first()
		const second = activate(store)
		expect(store.getModel()).toEqual({ value: "carried" })
		second()
	})
})

describe("crash projection", function () {
	it("isolates facade crash observers and recovers the retained health on a new activation", function () {
		const defect = new Error("terminal")
		const observations: Array<string> = []
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
		store.subscribeCrash(function () {
			throw new Error("internal observer")
		})
		store.subscribeCrash(function () {
			observations.push(Option.isSome(store.getCrash()) ? "crashed" : "healthy")
		})
		const first = activate(store)
		expect(store.commit(1)).toEqual(Result.void)
		store.dispatch(9)
		const cause = Option.getOrThrow(store.getCrash())
		first()
		expect(Option.getOrThrow(store.getCrash())).toBe(cause)
		const second = activate(store)
		expect(store.commit(2)).toEqual(Result.void)
		expect({ model: store.getModel(), crash: store.getCrash(), observations }).toEqual({
			model: 2,
			crash: Option.none(),
			observations: ["healthy", "crashed", "healthy"],
		})
		second()
	})

	it.live("does not overwrite replacement health when an older activation finishes resource cleanup", () =>
		Effect.asVoid(
			Effect.gen(function* () {
				const acquired = Deferred.makeUnsafe<void>()
				const releasing = Deferred.makeUnsafe<void>()
				const gate = Deferred.makeUnsafe<void>()
				const first = yield* Scope.make()
				const second = yield* Scope.make()
				let releases = 0
				const store = ReactStore.make<number, number>(
					{
						update(_model, message) {
							if (message === 9) throw new Error("old activation")
							return { model: message }
						},
						onCrash() {},
						layer: Layer.effectDiscard(
							Effect.acquireRelease(Deferred.succeed(acquired, undefined), () =>
								Effect.sync(function () {
									releases += 1
								}).pipe(
									Effect.andThen(Deferred.succeed(releasing, undefined)),
									Effect.andThen(Deferred.await(gate))
								)
							)
						),
					},
					{ model: 0, commands: [{ name: "Acquire", effect: Effect.never }] }
				)
				yield* store.activate.pipe(Scope.provide(first))
				yield* Deferred.await(acquired)
				store.dispatch(9)
				const closing = yield* Effect.forkChild(Scope.close(first, Exit.void), { startImmediately: true })
				yield* Deferred.await(releasing)
				yield* store.activate.pipe(Scope.provide(second))
				expect(store.commit(2)).toEqual(Result.void)
				yield* Deferred.succeed(gate, undefined)
				yield* Fiber.join(closing)
				expect({ model: store.getModel(), crash: store.getCrash(), releases }).toEqual({
					model: 2,
					crash: Option.none(),
					releases: 1,
				})
				yield* Scope.close(second, Exit.void)
			})
		)
	)
})

it("sends reactivation only for replacement activations, sharing it across leases", function () {
	const store = ReactStore.make<number, number>(
		{
			update: (model, message) => ({ model: model + message }),
			onReactivate: () => 10,
		},
		{ model: 1 }
	)
	const initial = activate(store)
	expect(store.getModel()).toBe(1)
	Result.getOrThrow(store.commit(2))
	initial()
	const replacement = activate(store)
	const lease = activate(store)
	expect(store.getModel()).toBe(13)
	replacement()
	Result.getOrThrow(store.commit(3))
	expect(store.getModel()).toBe(16)
	lease()
	const next = activate(store)
	expect(store.getModel()).toBe(26)
	next()
})

it.each(["callback", "update"] as const)(
	"distinguishes setup failure from a terminal replacement when %s throws",
	function (failure) {
		let shouldFail = true
		const defect = new Error(`reactivation ${failure} failed`)
		const store = ReactStore.make<number, number>(
			{
				update(model, message) {
					if (shouldFail && failure === "update") throw defect
					return { model: model + message }
				},
				onReactivate() {
					if (shouldFail && failure === "callback") throw defect
					return 10
				},
				onCrash() {},
			},
			{ model: 1 }
		)
		activate(store)()
		const failedScope = Scope.makeUnsafe()
		const exit = Effect.runSyncExit(store.activate.pipe(Scope.provide(failedScope)))
		if (failure === "callback") {
			expect(exit).toEqual(Exit.die(defect))
			expect(store.getCrash()).toEqual(Option.none())
			expect(store.commit(2)).toEqual(Result.fail(new CommitError({ details: { reason: "Inactive" } })))
		} else {
			expect(exit).toEqual(Exit.void)
			expect(store.getCrash()).toEqual(Option.some(Cause.die(defect)))
			expect(store.commit(2)).toEqual(
				Result.fail(new CommitError({ details: { reason: "Crashed", cause: Cause.die(defect) } }))
			)
		}
		Effect.runSync(Scope.close(failedScope, Exit.void))
		expect(store.commit(2)).toEqual(Result.fail(new CommitError({ details: { reason: "Inactive" } })))
		shouldFail = false
		const replacement = activate(store)
		expect(store.getModel()).toBe(11)
		Result.getOrThrow(store.commit(2))
		expect(store.getModel()).toBe(13)
		replacement()
	}
)

it.live("releases a failed reactivation scope before its queued resources can start", () =>
	Effect.gen(function* () {
		const started = Deferred.makeUnsafe<void>()
		const restarted = Deferred.makeUnsafe<void>()
		let starts = 0
		let acquisitions = 0
		let releases = 0
		let shouldFail = true
		const store = ReactStore.make<number, number>(
			{
				update: (model, message) => ({ model: model + message }),
				onReactivate() {
					if (shouldFail) throw new Error("resume failed")
					return 10
				},
				layer: Layer.effectDiscard(
					Effect.acquireRelease(
						Effect.sync(function () {
							acquisitions += 1
						}),
						() =>
							Effect.sync(function () {
								releases += 1
							})
					)
				),
			},
			{
				model: 1,
				commands: [
					{
						name: "PendingInit",
						effect: Effect.gen(function* () {
							starts += 1
							yield* Deferred.succeed(starts === 1 ? started : restarted, undefined)
							return yield* Effect.never
						}),
					},
				],
			}
		)
		const first = yield* Scope.make()
		yield* store.activate.pipe(Scope.provide(first))
		yield* Deferred.await(started)
		yield* Scope.close(first, Exit.void)
		const failed = yield* Scope.make()
		const exit = yield* Effect.exit(store.activate.pipe(Scope.provide(failed)))
		expect(Exit.isFailure(exit)).toBe(true)
		yield* Scope.close(failed, Exit.void)
		shouldFail = false
		const last = yield* Scope.make()
		yield* store.activate.pipe(Scope.provide(last))
		yield* Deferred.await(restarted)
		yield* Scope.close(last, Exit.void)
		expect({ acquisitions, releases, model: store.getModel() }).toEqual({
			acquisitions: 2,
			releases: 2,
			model: 11,
		})
	})
)
