import { expect, it } from "@effect/vitest"
import { Option } from "effect"
import { stabilize } from "./modelSource"

it("stabilize keeps the wrapper reference while the Model is unchanged", function () {
	let model: { count: number } = { count: 0 }
	const read = stabilize(Option.some, () => model)
	const first = read()
	expect(read()).toBe(first)
	model = { count: 1 }
	expect(read()).not.toBe(first)
	expect(read()).toEqual(Option.some({ count: 1 }))
	expect(read()).toBe(read())
})
