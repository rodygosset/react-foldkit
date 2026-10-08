import { Effect, Exit, Option, Result, Schema, Scope } from "effect"
import fc from "fast-check"
import { expect, it, vi } from "vitest"
import * as AsyncData from "./asyncData"
import * as Connection from "./commitSource/connection"
import * as Loader from "./loader"
import * as Query from "foldkit/experimental/query"
import * as ReactStore from "./react/reactStore"
import * as Store from "./store"

it("preserves FIFO across arbitrary dispatch and commit sequences", function () {
	const clock = vi.spyOn(performance, "now").mockReturnValue(0)
	try {
		fc.assert(
			fc.property(fc.array(fc.record({ value: fc.integer(), commit: fc.boolean() })), function (inputs) {
				const store = Store.boot(
					{ update: (model: ReadonlyArray<number>, message: number) => ({ model: [...model, message] }) },
					{ model: [] }
				)
				try {
					for (const input of inputs) {
						if (input.commit) Result.getOrThrow(store.commit(input.value))
						else store.dispatch(input.value)
					}
					expect(store.getModel()).toEqual(inputs.map((input) => input.value))
				} finally {
					Effect.runSync(store.dispose())
				}
			}),
			{ numRuns: 100 }
		)
	} finally {
		clock.mockRestore()
	}
})

it("deduplicates source versions across arbitrary reactivations", function () {
	fc.assert(
		fc.property(
			fc.array(fc.record({ version: fc.integer({ min: 0, max: 5 }), reconnect: fc.boolean() })),
			function (inputs) {
				let snapshot: ReadonlyArray<{ key: string; version: number; message: number }> = []
				let notify = function () {}
				const source = {
					getSnapshot: () => Result.succeed(snapshot),
					subscribe(listener: () => void) {
						notify = listener
						return function () {
							notify = function () {}
						}
					},
				}
				const connection = Result.getOrThrow(Connection.make({ source, initialSnapshot: [] }))
				const store = ReactStore.make(
					{ update: (model: number, message: number) => ({ model: model + message }) },
					{ model: 0 }
				)
				let scope = Scope.makeUnsafe()
				function activate(): void {
					Effect.runSync(store.activate.pipe(Scope.provide(scope)))
					Effect.runSync(
						connection
							.connect(store.commit, (exit) => expect(Exit.isSuccess(exit)).toBe(true))
							.pipe(Scope.provide(scope))
					)
				}
				activate()
				let previous: number | undefined
				let expected = 0
				try {
					for (const input of inputs) {
						snapshot = [{ key: "one", version: input.version, message: 1 }]
						notify()
						if (previous !== input.version) expected++
						previous = input.version
						if (input.reconnect) {
							Effect.runSync(Scope.close(scope, Exit.void))
							scope = Scope.makeUnsafe()
							activate()
						}
						expect(store.getModel()).toBe(expected)
					}
				} finally {
					Effect.runSync(Scope.close(scope, Exit.void))
				}
			}
		),
		{ numRuns: 100 }
	)
})

it("rejects pre-settlement Query generations for arbitrary numbers of external deliveries", function () {
	const query = Query.define({
		name: "Generation",
		data: Schema.Finite,
		error: Schema.String,
		execute: Effect.succeed(0),
	})
	const policy = { fresher: () => true }
	fc.assert(
		fc.property(fc.array(fc.integer(), { minLength: 1, maxLength: 30 }), function (values) {
			let model = query.init()
			for (const value of values) {
				const pending = query.revalidate(model)
				const settled = Loader.settleQueryIf(query, pending.model, AsyncData.Success({ data: value }), policy)
				const stale = query.update(
					settled.model,
					query.Message.CompletedFetch({ generation: pending.model.generation, result: Result.succeed(-999) })
				)
				expect(stale.model).toBe(settled.model)
				expect(AsyncData.getData(settled.model.data)).toEqual(Option.some(value))
				model = settled.model
			}
		}),
		{ numRuns: 100 }
	)
})
