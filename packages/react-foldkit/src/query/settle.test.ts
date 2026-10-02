import { describe, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, HashMap, Option, Result, Schema } from "effect"
import { expect } from "vitest"
import { modifyFields } from "../struct"
import * as AsyncData from "../asyncData"
import { CurrentInterruptRegistry, makeInterruptRegistry } from "../internal/foldkit"
import { defineMessageUnion } from "../message"
import * as Query from "./index"

const single = Query.define({
	name: "SettleSingle",
	data: Schema.String,
	error: Schema.String,
	execute: Effect.succeed("fetch"),
})
const keyed = Query.define({
	name: "SettleKeyed",
	data: Schema.String,
	error: Schema.String,
	args: { id: Schema.String, label: Schema.String },
	toKey: ({ id }) => id,
	execute: ({ label }) => Effect.succeed(label),
})
const a = { id: "a", label: "original" }
const b = { id: "b", label: "sibling" }
const external = AsyncData.Success({ data: "external" })
const failure = AsyncData.Failure({ error: "unavailable" })
const unsettled: ReadonlyArray<AsyncData.AsyncData<string, string>> = [
	AsyncData.Idle(),
	AsyncData.Loading(),
	AsyncData.Refreshing({ data: "pending" }),
	AsyncData.Stale({ data: "known", error: "old" }),
]

describe("Query.settle", () => {
	it("installs an external outcome without fetching and invalidates older completions", () => {
		const pending = single.loadIfMissing(single.init("home"))
		const settled = single.settle(pending.model, external)
		expect(settled.commands).toBeUndefined()
		expect(settled.model).toMatchObject({ nextRequestId: 2, maybePendingRequestId: Option.none(), data: external })
		const oldMessage = single.Message.SettledFetch({
			instanceId: "home",
			requestId: 0,
			result: Result.succeed("old"),
		})
		expect(single.update(settled.model, oldMessage).model).toBe(settled.model)
		const refreshed = single.revalidate(settled.model)
		expect(single.update(refreshed.model, oldMessage).model).toBe(refreshed.model)
		const current = single.update(
			refreshed.model,
			single.Message.SettledFetch({
				instanceId: "home",
				requestId: 2,
				result: Result.succeed("new"),
			})
		)
		expect(single.read(current.model)).toEqual(AsyncData.Success({ data: "new" }))
	})

	it("settleIf installs fresher Success and empty Failure only", () => {
		const always = function () {
			return true
		}
		const differs = function (incoming: string, current: string) {
			return incoming !== current
		}
		const empty = single.init("home")
		expect(single.settleIf(empty, failure, { fresher: always }).model.data).toEqual(failure)
		const known = single.settle(empty, external).model
		expect(single.settleIf(known, failure, { fresher: always }).model).toBe(known)
		expect(
			single.settleIf(known, AsyncData.Success({ data: "newer" }), { fresher: differs }).model.data
		).toEqual(AsyncData.Success({ data: "newer" }))
		expect(single.settleIf(known, AsyncData.Success({ data: "external" }), { fresher: differs }).model).toBe(known)
		const pending = single.revalidate(known).model
		expect(single.settleIf(pending, failure, { fresher: always }).model).toBe(pending)
	})

	it("uses AsyncData's last-good-data policy and leaves non-outcomes inert", () => {
		const empty = single.init("home")
		expect(single.read(single.settle(empty, failure).model)).toEqual(failure)
		const known = single.settle(empty, external).model
		const refreshing = single.revalidate(known).model
		const stale = single.settle(refreshing, failure).model
		expect(single.read(stale)).toEqual(AsyncData.Stale({ data: "external", error: "unavailable" }))
		expect(single.read(single.settle(external)(stale).model)).toEqual(external)
		for (const state of unsettled) {
			const ignored = single.settle(refreshing, state)
			expect(ignored.model).toBe(refreshing)
			expect(ignored.commands).toBeUndefined()
		}
	})

	it("settleIfLoad mirrors settleIf for Loader-shaped payloads", () => {
		const differs = function (incoming: string, current: string) {
			return incoming !== current
		}
		const empty = keyed.init("home")
		const load = { ...a, result: external }
		expect(keyed.settleIfLoad(empty, load, { fresher: differs }).model).toEqual(
			keyed.settleIf(empty, a, external, { fresher: differs }).model
		)
	})

	it("settles only the addressed key, preserving siblings and the supplied args", () => {
		const first = keyed.loadIfMissing(keyed.init("home"), a).model
		const pending = keyed.loadIfMissing(first, b).model
		const replacementArgs = { ...a, label: "authoritative" }
		const settled = keyed.settle(pending, replacementArgs, external)
		expect(settled.commands).toBeUndefined()
		expect(Option.getOrThrow(HashMap.get(settled.model.slots, "b"))).toBe(
			Option.getOrThrow(HashMap.get(pending.slots, "b"))
		)
		expect(HashMap.get(settled.model.slots, "a")).toEqual(
			Option.some({ args: replacementArgs, data: external, maybePendingRequestId: Option.none() })
		)
		const old = keyed.Message.SettledFetch({
			args: a,
			instanceId: "home",
			requestId: 0,
			result: Result.succeed("old"),
		})
		const refreshed = keyed.revalidate(settled.model, a)
		expect(keyed.update(refreshed.model, old).model).toBe(refreshed.model)
		const sibling = keyed.update(
			refreshed.model,
			keyed.Message.SettledFetch({ args: b, instanceId: "home", requestId: 1, result: Result.succeed("sibling") })
		)
		expect(keyed.read(sibling.model, b)).toEqual(AsyncData.Success({ data: "sibling" }))
		expect(keyed.read(keyed.settle(a, failure)(settled.model).model, a)).toEqual(
			AsyncData.Stale({ data: "external", error: "unavailable" })
		)
		for (const state of unsettled) {
			const ignored = keyed.settle(pending, a, state)
			expect(ignored.model).toBe(pending)
			expect(ignored.commands).toBeUndefined()
		}
		expect(keyed.read(keyed.settle(keyed.init("empty"), a, failure).model, a)).toEqual(failure)
	})

	it("lifts settlement and interruption through a field and an optional lens", () => {
		const query = Query.define({
			name: "LiftSettle",
			data: Schema.String,
			error: Schema.String,
			interrupt: true,
			execute: Effect.never,
		})
		type Model = { readonly query: typeof query.Model.Type; readonly edits: number }
		const Message = defineMessageUnion({ GotQuery: { message: query.Message } })
		const child = query.lift<Model, typeof Message.Type>({
			field: "query",
			toParentMessage: (message) => Message.GotQuery({ message }),
		})
		const parent: Model = { query: query.loadIfMissing(query.init("home")).model, edits: 3 }
		const settled = child.settle(external)(parent)
		expect(settled.model.edits).toBe(3)
		expect(settled.model.query.data).toEqual(external)
		expect(settled.commands).toHaveLength(1)
		type OptionalParent = { readonly query: Option.Option<typeof keyed.Model.Type>; readonly edits: number }
		const optional = keyed.lift({
			read: (model: OptionalParent) => model.query,
			write: (model, query) => modifyFields(model, { query: () => Option.some(query) }),
			toParentMessage: (message) => ({ _tag: "GotKeyed" as const, message }),
		})
		const absent: OptionalParent = { query: Option.none(), edits: 4 }
		expect(optional.settle(absent, a, external)).toEqual({ model: absent })
		const present: OptionalParent = { ...absent, query: Option.some(keyed.init("child")) }
		const installed = optional.settle(a, external)(present)
		expect(keyed.read(Option.getOrThrow(installed.model.query), a)).toEqual(external)
		expect(installed.model.edits).toBe(4)
	})

	it.effect("a delayed single-slot interrupt cancels the old Fetch, leaving the newer Fetch alive", () =>
		Effect.gen(function* () {
			const entered = yield* Deferred.make<void>()
			const query = Query.define({
				name: "SingleRace",
				data: Schema.String,
				error: Schema.String,
				interrupt: true,
				execute: Effect.andThen(Deferred.succeed(entered, undefined), Effect.never),
			})
			const registry = makeInterruptRegistry()
			const provide = <A, E>(effect: Effect.Effect<A, E>) =>
				Effect.provideService(effect, CurrentInterruptRegistry, registry)
			const old = query.loadIfMissing(query.init("home"))
			const oldFiber = yield* Effect.forkChild(provide(old.commands![0]!.effect))
			yield* Deferred.await(entered)
			const settled = query.settle(old.model, external)
			const next = query.revalidate(settled.model)
			const nextFiber = yield* Effect.forkChild(provide(next.commands![0]!.effect))
			yield* Effect.yieldNow
			const cancellation = yield* provide(settled.commands![0]!.effect)
			expect(cancellation._tag).toBe("CompletedCancelFetch")
			if (cancellation._tag === "CompletedCancelFetch") expect(cancellation.outcome._tag).toBe("Interrupted")
			expect((yield* Fiber.await(oldFiber))._tag).toBe("Failure")
			expect(registry.lookup(next.commands![0]!.key!)).toHaveLength(1)
			expect(query.update(next.model, cancellation)).toEqual({ model: next.model })
			yield* Fiber.interrupt(nextFiber)
		})
	)

	it.effect("a keyed settlement interrupts its old request without interrupting its sibling or successor", () =>
		Effect.gen(function* () {
			const query = Query.define({
				name: "KeyedRace",
				args: { id: Schema.String },
				data: Schema.String,
				error: Schema.String,
				interrupt: true,
				execute: () => Effect.never,
			})
			const registry = makeInterruptRegistry()
			const provide = <A, E>(effect: Effect.Effect<A, E>) =>
				Effect.provideService(effect, CurrentInterruptRegistry, registry)
			const first = query.loadIfMissing(query.init("home"), a)
			const sibling = query.loadIfMissing(first.model, b)
			const oldFiber = yield* Effect.forkChild(provide(first.commands![0]!.effect))
			const siblingFiber = yield* Effect.forkChild(provide(sibling.commands![0]!.effect))
			yield* Effect.yieldNow
			const settled = query.settle(sibling.model, a, external)
			const next = query.revalidate(settled.model, a)
			const nextFiber = yield* Effect.forkChild(provide(next.commands![0]!.effect))
			yield* Effect.yieldNow
			const cancellation = yield* provide(settled.commands![0]!.effect)
			expect((yield* Fiber.await(oldFiber))._tag).toBe("Failure")
			expect(registry.lookup(sibling.commands![0]!.key!)).toHaveLength(1)
			expect(registry.lookup(next.commands![0]!.key!)).toHaveLength(1)
			expect(query.update(next.model, cancellation)).toEqual({ model: next.model })
			yield* Fiber.interruptAll([siblingFiber, nextFiber])
		})
	)
})
