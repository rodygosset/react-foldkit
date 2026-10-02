import { Cause, Effect, Exit, Latch, Layer, Result, Schema, Stream } from "effect"
import { describe, expect, it, vi } from "vitest"
import { modifyFields } from "../struct"
import type * as Command from "../command"
import { defineMessageUnion } from "../message"
import * as Subscription from "../subscription"
import type * as Update from "../update"
import * as ReactStore from "./react-store"
import { CommitError } from "../store"

function activate<Model, Message>(store: ReactStore.ReactStore<Model, Message>): () => void {
	const deactivate = Effect.runSync(store.activate)
	return () => Effect.runSync(deactivate)
}
function register<Model, Message, E>(
	store: ReactStore.ReactStore<Model, Message>,
	effect: Effect.Effect<void, E, import("effect").Scope.Scope>
): () => void {
	const disconnect = Effect.runSync(store.onActivate(effect))
	return () => Effect.runSync(disconnect)
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
	it("rejects inactive commits, drops inactive dispatches, and preserves the Model across reactivation", function () {
		const store = ReactStore.make({ update }, { model: { value: "initial" } })

		expect(store.commit(Message.SetValue({ value: "before activation" }))).toEqual(
			Result.fail(new CommitError({ reason: "Inactive" }))
		)
		store.dispatch(Message.SetValue({ value: "before activation" }))
		expect(store.getModel()).toEqual({ value: "initial" })

		const deactivateFirst = activate(store)
		Result.getOrThrow(store.commit(Message.SetValue({ value: "live" })))
		expect(store.getModel()).toEqual({ value: "live" })
		deactivateFirst()

		expect(store.commit(Message.SetValue({ value: "while inactive" }))).toEqual(
			Result.fail(new CommitError({ reason: "Inactive" }))
		)
		store.dispatch(Message.SetValue({ value: "while inactive" }))
		const deactivateSecond = activate(store)
		expect(store.getModel()).toEqual({ value: "live" })
		deactivateSecond()
	})

	it("ignores stale and repeated cleanup calls without deactivating a newer lifetime", () => {
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
			Result.fail(new CommitError({ reason: "Inactive" }))
		)
	})

	it("does not rerun an init Command after it has produced its result", async function () {
		let runs = 0
		const command = makeInitCommand(
			Effect.sync(function () {
				runs += 1
				return Message.CompletedInit({ value: "complete" })
			})
		)
		const store = ReactStore.make({ update }, { model: { value: "initial" }, commands: [command] })

		const deactivateFirst = activate(store)
		await vi.waitFor(function () {
			expect(store.getModel()).toEqual({ value: "complete" })
		})
		deactivateFirst()

		const deactivateSecond = activate(store)
		await Effect.runPromise(Effect.yieldNow)
		expect(runs).toBe(1)
		expect(store.getModel()).toEqual({ value: "complete" })
		deactivateSecond()
	})

	it("restarts an interrupted init Command until it produces its result", async function () {
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
		await vi.waitFor(function () {
			expect(runs).toBe(1)
		})
		deactivateFirst()

		const deactivateSecond = activate(store)
		await vi.waitFor(function () {
			expect(runs).toBe(2)
		})
		Effect.runSync(latch.open)
		await vi.waitFor(function () {
			expect(store.getModel()).toEqual({ value: "complete" })
		})
		deactivateSecond()

		const deactivateThird = activate(store)
		await Effect.runPromise(Effect.yieldNow)
		expect(runs).toBe(2)
		deactivateThird()
	})

	it("reconnects Subscriptions and Layer resources on every activation", async function () {
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
		await vi.waitFor(function () {
			expect(acquires).toBe(1)
		})
		deactivateFirst()
		await vi.waitFor(function () {
			expect(releases).toBe(1)
		})

		const deactivateSecond = activate(store)
		await vi.waitFor(function () {
			expect(acquires).toBe(2)
		})
		deactivateSecond()
		await vi.waitFor(function () {
			expect(releases).toBe(2)
		})
	})

	it("rejects overlapping activations", function () {
		const store = ReactStore.make({ update }, { model: { value: "initial" } })
		const deactivate = activate(store)

		try {
			expect(function () {
				activate(store)
			}).toThrow("react-foldkit store is already active")
		} finally {
			deactivate()
		}
	})
})

describe("external connection lifecycle", () => {
	it("rolls back a failed late registration without stopping the active store", () => {
		const store = ReactStore.make({ update }, { model: { value: "initial" } })
		const released = vi.fn()
		const failed = Effect.gen(function* () {
			yield* Effect.addFinalizer(() => Effect.sync(released))
			return yield* Effect.fail(new Error("late connection failed"))
		})
		const first = activate(store)

		expect(() => register(store, failed)).toThrow("late connection failed")
		expect(released).toHaveBeenCalledTimes(1)
		Result.getOrThrow(store.commit(Message.SetValue({ value: "still active" })))
		expect(store.getModel()).toEqual({ value: "still active" })
		first()

		const second = activate(store)
		expect(store.getModel()).toEqual({ value: "still active" })
		second()
		expect(released).toHaveBeenCalledTimes(1)
	})

	it("starts only after activation, reconnects once per lifetime, and cancels registrations", () => {
		const store = ReactStore.make({ update }, { model: { value: "initial" } })
		let starts = 0
		let stops = 0
		const remove = register(
			store,
			Effect.gen(function* () {
				starts += 1
				yield* Effect.fromResult(store.commit(Message.SetValue({ value: "source" })))
				yield* Effect.addFinalizer(() =>
					Effect.sync(() => {
						stops += 1
					})
				)
			})
		)
		expect(starts).toBe(0)
		const first = activate(store)
		expect(starts).toBe(1)
		expect(store.getModel()).toEqual({ value: "source" })
		first()
		expect(stops).toBe(1)
		const second = activate(store)
		expect(starts).toBe(2)
		remove()
		remove()
		expect(stops).toBe(2)
		second()
		const third = activate(store)
		expect(starts).toBe(2)
		third()
	})

	it("rolls back an unsuccessful activation and releases previously acquired connections", () => {
		const store = ReactStore.make({ update }, { model: { value: "initial" } })
		const release = vi.fn()
		register(
			store,
			Effect.addFinalizer(() => Effect.sync(release))
		)
		const defect = new Error("connection failed")
		const removeBad = register(store, Effect.die(defect))
		expect(() => activate(store)).toThrow(defect)
		expect(release).toHaveBeenCalledTimes(1)
		expect(store.commit(Message.SetValue({ value: "after failure" }))).toEqual(
			Result.fail(new CommitError({ reason: "Inactive" }))
		)
		removeBad()
		const deactivate = activate(store)
		deactivate()
		expect(release).toHaveBeenCalledTimes(2)
	})

	it("releases every scoped connection despite a cleanup defect and remains inactive", () => {
		const store = ReactStore.make({ update }, { model: { value: "initial" } })
		const good = vi.fn()
		const bad = vi.fn(() => {
			throw new Error("cleanup failed")
		})
		register(
			store,
			Effect.addFinalizer(() => Effect.sync(good))
		)
		const removeBad = register(
			store,
			Effect.addFinalizer(() => Effect.sync(bad))
		)
		const deactivate = activate(store)
		expect(deactivate).toThrow("cleanup failed")
		expect(good).toHaveBeenCalledTimes(1)
		expect(bad).toHaveBeenCalledTimes(1)
		expect(store.commit(Message.SetValue({ value: "inactive" }))).toEqual(
			Result.fail(new CommitError({ reason: "Inactive" }))
		)
		deactivate()
		removeBad()
		const again = activate(store)
		again()
		expect(good).toHaveBeenCalledTimes(2)
		expect(bad).toHaveBeenCalledTimes(1)
	})

	it("preserves activation failure and cleanup failure together in the Effect Cause", () => {
		const store = ReactStore.make({ update }, { model: { value: "initial" } })
		register(
			store,
			Effect.addFinalizer(() => Effect.die(new Error("release failed")))
		)
		const failure = new Error("setup failed")
		register(store, Effect.fail(failure))
		const exit = Effect.runSyncExit(store.activate)
		expect(Exit.isFailure(exit)).toBe(true)
		if (Exit.isFailure(exit)) {
			expect(Result.getOrThrow(Cause.findError(exit.cause))).toBe(failure)
			expect(String(Result.getOrThrow(Cause.findDefect(exit.cause)))).toContain("release failed")
		}
		expect(store.commit(Message.SetValue({ value: "inactive" }))).toEqual(
			Result.fail(new CommitError({ reason: "Inactive" }))
		)
	})
})
