import { Effect, Result } from "effect"
import fc from "fast-check"
import { expect, it, vi } from "vitest"
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
