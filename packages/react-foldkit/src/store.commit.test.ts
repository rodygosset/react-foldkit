import { it } from "@effect/vitest"
import { Array, Cause, Effect, Exit, Result } from "effect"
import { afterEach, beforeEach, describe, expect, vi } from "vitest"
import * as Store from "./store"
import { controlledDrains } from "../test/fixtures/controlledDrains"
import type * as Update from "./update"

type Message = { readonly label: string; readonly burn?: number }
type Model = ReadonlyArray<string>
const stores: Array<Store.Store<Model, Message>> = []
let clock = 0
let drains: ReturnType<typeof controlledDrains>

beforeEach(function () {
	clock = 0
	drains = controlledDrains()
	vi.stubGlobal("MessageChannel", drains.Channel)
	vi.spyOn(performance, "now").mockImplementation(() => clock)
})
afterEach(function () {
	for (const store of stores.splice(0)) Effect.runSync(store.dispose())
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
})

function boot(extra?: (model: Model, message: Message) => Update.Return<Model, Message>) {
	const onCrash = vi.fn()
	const store = Store.boot(
		{
			update(model: Model, message: Message) {
				// Advancing this clock past the 5 ms budget defers subsequent dispatches.
				clock += message.burn ?? 0
				return extra?.(model, message) ?? { model: Array.append(model, message.label) }
			},
			onCrash,
		},
		{ model: [] }
	)
	stores.push(store)
	return { store, onCrash }
}
function failReason(
	action: () => Result.Result<void, Store.CommitError>,
	reason: Store.CommitError["details"]["reason"]
) {
	const result = action()
	expect(Result.isFailure(result)).toBe(true)
	if (Result.isSuccess(result)) return expect.fail("Expected commit failure")
	expect(result.failure.details.reason).toBe(reason)
	return result.failure
}

describe("synchronous commit", function () {
	it("the Effect adapter is lazy, repeatable, and exposes commit errors as typed failures", function () {
		const { store } = boot()
		const commit = Store.commit(store, { label: "effect" })
		expect(store.getModel()).toEqual([])
		Effect.runSync(commit)
		Effect.runSync(commit)
		expect(store.getModel()).toEqual(["effect", "effect"])
		Effect.runSync(store.dispose())
		failReason(() => store.commit({ label: "after-disposal" }), "Disposed")
		expect(store.getModel()).toEqual(["effect", "effect"])
		const exit = Effect.runSyncExit(commit)
		expect(Exit.isFailure(exit)).toBe(true)
		if (Exit.isFailure(exit)) {
			expect(Result.getOrThrow(Cause.findError(exit.cause)).details.reason).toBe("Disposed")
			expect(Cause.hasDies(exit.cause)).toBe(false)
		}
	})

	it("publishes its resulting Model and notifies synchronously before returning", function () {
		const { store } = boot()
		const observed: Model[] = []
		store.subscribe(() => observed.push(store.getModel()))
		Result.getOrThrow(store.commit({ label: "committed" }))
		expect(store.getModel()).toEqual(["committed"])
		expect(observed).toEqual([["committed"]])
	})

	it("stops at its own queue entry and schedules listener-enqueued work normally", function () {
		const { store } = boot()
		store.subscribe(function () {
			if (store.getModel().at(-1) === "earlier") store.dispatch({ label: "later" })
		})
		store.dispatch({ label: "burn", burn: 10 })
		store.dispatch({ label: "earlier" })
		expect(store.getModel()).toEqual(["burn"])
		expect(drains.pending).toBeGreaterThan(0)
		Result.getOrThrow(store.commit({ label: "target" }))
		expect(store.getModel()).toEqual(["burn", "earlier", "target"])
		// The canceled old callback must not consume the new deferred work.
		drains.flushNext()
		expect(store.getModel()).toEqual(["burn", "earlier", "target"])
		drains.flush()
		expect(store.getModel()).toEqual(["burn", "earlier", "target", "later"])
	})

	it("does not confuse repeated Message references with the commit boundary", function () {
		const { store } = boot()
		const repeated = { label: "same" }
		store.dispatch({ label: "burn", burn: 10 })
		store.dispatch(repeated)
		store.dispatch(repeated)
		expect(store.getModel()).toEqual(["burn"])
		expect(drains.pending).toBeGreaterThan(0)
		Result.getOrThrow(store.commit(repeated))
		expect(store.getModel()).toEqual(["burn", "same", "same", "same"])
	})

	it("an obsolete callback cannot reset the budget or prematurely drain a new queue", function () {
		const { store } = boot()
		store.dispatch({ label: "burn", burn: 10 })
		store.dispatch({ label: "queued" })
		expect(store.getModel()).toEqual(["burn"])
		expect(drains.pending).toBeGreaterThan(0)
		Result.getOrThrow(store.commit({ label: "target" }))
		store.dispatch({ label: "after" })
		expect(store.getModel()).toEqual(["burn", "queued", "target"])
		drains.flushNext()
		expect(store.getModel()).toEqual(["burn", "queued", "target"])
		drains.flush()
		expect(store.getModel()).toEqual(["burn", "queued", "target", "after"])
	})

	it("rejects a reentrant commit in update before enqueueing it", function () {
		let store: Store.Store<Model, Message>
		let nestedResult: Result.Result<void, Store.CommitError> | undefined
		const made = boot(function (model, message) {
			if (message.label === "outer") nestedResult = store.commit({ label: "nested" })
			return { model: Array.append(model, message.label) }
		})
		store = made.store
		const outerResult = store.commit({ label: "outer" })
		expect(nestedResult).toEqual(Result.fail(new Store.CommitError({ details: { reason: "Reentrant" } })))
		Result.getOrThrow(outerResult)
		Result.getOrThrow(store.commit({ label: "next" }))
		expect(store.getModel()).toEqual(["outer", "next"])
		expect(made.onCrash).not.toHaveBeenCalled()
	})

	it("rejects a reentrant commit in a synchronous notification before enqueueing it", function () {
		const { store, onCrash } = boot()
		let nestedResult: Result.Result<void, Store.CommitError> | undefined
		store.subscribe(function () {
			if (store.getModel().at(-1) === "outer") nestedResult = store.commit({ label: "nested" })
		})
		const outerResult = store.commit({ label: "outer" })
		expect(nestedResult).toEqual(Result.fail(new Store.CommitError({ details: { reason: "Reentrant" } })))
		Result.getOrThrow(outerResult)
		Result.getOrThrow(store.commit({ label: "next" }))
		expect(store.getModel()).toEqual(["outer", "next"])
		expect(onCrash).not.toHaveBeenCalled()
	})

	it("reports a prior queued crash, preserves its Cause, and never processes the target", function () {
		const defect = new Error("prior update failed")
		const { store, onCrash } = boot(function (model, message) {
			if (message.label === "fail") throw defect
			return { model: Array.append(model, message.label) }
		})
		store.dispatch({ label: "burn", burn: 10 })
		store.dispatch({ label: "fail" })
		expect(store.getModel()).toEqual(["burn"])
		expect(drains.pending).toBeGreaterThan(0)
		const error = failReason(() => store.commit({ label: "target" }), "Crashed")
		expect(error.details.reason).toBe("Crashed")
		if (error.details.reason === "Crashed") expect(Cause.squash(error.details.cause)).toBe(defect)
		expect(onCrash).toHaveBeenCalledTimes(1)
		expect(store.getModel()).toEqual(["burn"])
		failReason(() => store.commit({ label: "again" }), "Crashed")
		drains.flush()
		expect(store.getModel()).toEqual(["burn"])
	})

	it("fails when the target update crashes rather than returning success", function () {
		const { store, onCrash } = boot(function () {
			throw new Error("target failed")
		})
		failReason(() => store.commit({ label: "target" }), "Crashed")
		expect(onCrash).toHaveBeenCalledTimes(1)
		expect(store.getModel()).toEqual([])
	})

	it("isolates notification defects after the target Model is installed", function () {
		const { store, onCrash } = boot()
		const defect = new Error("notification failed")
		const unsubscribe = store.subscribe(function () {
			throw defect
		})
		const notified = vi.fn()
		store.subscribe(notified)
		expect(store.commit({ label: "target" })).toEqual(Result.void)
		expect(notified).toHaveBeenCalledTimes(1)
		expect(store.getModel()).toEqual(["target"])
		expect(onCrash).not.toHaveBeenCalled()
		unsubscribe()
	})

	it("fails when an earlier queued Message's listener disposes the store", function () {
		const { store } = boot()
		store.subscribe(function () {
			if (store.getModel().at(-1) === "dispose") Effect.runFork(store.dispose())
		})
		store.dispatch({ label: "burn", burn: 10 })
		store.dispatch({ label: "dispose" })
		expect(store.getModel()).toEqual(["burn"])
		expect(drains.pending).toBeGreaterThan(0)
		failReason(() => store.commit({ label: "target" }), "Disposed")
		expect(store.getModel()).toEqual(["burn", "dispose"])
	})

	it.live("runs Commands asynchronously once through the ordinary Effect runtime", () =>
		Effect.gen(function* () {
			let executions = 0
			const { store } = boot((model, message) => ({
				model: Array.append(model, message.label),
				commands:
					message.label === "start"
						? [
								{
									name: "Complete",
									effect: Effect.sync(function () {
										executions += 1
										return { label: "result" }
									}),
								},
							]
						: [],
			}))
			Result.getOrThrow(store.commit({ label: "start" }))
			expect(executions).toBe(0)
			expect(store.getModel()).toEqual(["start"])
			yield* Effect.promise(() => vi.waitFor(() => expect(store.getModel()).toEqual(["start", "result"])))
			expect(executions).toBe(1)
		})
	)
})
