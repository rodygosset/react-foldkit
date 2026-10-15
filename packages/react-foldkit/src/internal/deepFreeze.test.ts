import { HashMap, Option } from "effect"
import { describe, expect, it } from "vitest"
import { deepFreeze } from "./deepFreeze"

/**
 * Development builds freeze every published Model so a mutation throws where it happens. The
 * walk freezes the plain data a Model is made of. It leaves Effect values and class instances
 * alone, because Effect caches hashes on them and frozen instances break that cache.
 */
describe("deepFreeze", function () {
	it("freezes plain objects and arrays at every depth", function () {
		const model = { projects: [{ tags: ["a"] }], filters: { status: { done: true } } }

		deepFreeze(model)

		expect(Object.isFrozen(model.projects)).toBe(true)
		expect(Object.isFrozen(model.projects[0]?.tags)).toBe(true)
		expect(Object.isFrozen(model.filters.status)).toBe(true)
	})

	it("freezes the value inside Some without freezing the Option", function () {
		const selected = Option.some({ id: "a" })

		deepFreeze({ selected })

		expect(Object.isFrozen(selected)).toBe(false)
		expect(Object.isFrozen(Option.getOrThrow(selected))).toBe(true)
	})

	it("leaves Effect values and class instances unfrozen", function () {
		class Draft {
			title = "draft"
		}
		const model = { cache: HashMap.make(["a", 1]), draft: new Draft() }

		deepFreeze(model)

		expect(Object.isFrozen(model)).toBe(true)
		expect(Object.isFrozen(model.cache)).toBe(false)
		expect(Object.isFrozen(model.draft)).toBe(false)
	})
})
