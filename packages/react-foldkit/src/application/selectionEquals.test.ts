import { Data, Equal, Hash, Option } from "effect"
import fc from "fast-check"
import { expect, it } from "vitest"
import { selectionEquals } from "./selectionEquals"

class Point extends Data.Class<{ readonly x: number }> {}

const leaf = fc.oneof(
	fc.integer({ min: -2, max: 2 }),
	fc.constantFrom(0, -0, Number.NaN, "a", "b", true, false, null, undefined),
	fc.integer({ min: 0, max: 2 }).map((n) => (n === 0 ? Option.none() : Option.some(n))),
	fc.integer({ min: 0, max: 2 }).map((x) => new Point({ x })),
	fc.integer({ min: 0, max: 2 }).map((ms) => new Date(ms)),
	fc.constantFrom(new Map([[1, "a"]]), new Set([1]))
)

const { value } = fc.letrec((tie) => ({
	value: fc.oneof(
		{ depthSize: "small" },
		leaf,
		fc.array(tie("value"), { maxLength: 3 }),
		fc.dictionary(fc.constantFrom("a", "b", "c"), tie("value"), { maxKeys: 3 })
	),
}))

// Rebuilds plain arrays and objects, so a copy shares only its leaves with the original.
function copyPlain(input: unknown): unknown {
	if (Array.isArray(input)) return input.map(copyPlain)
	if (typeof input === "object" && input !== null && Object.getPrototypeOf(input) === Object.prototype) {
		return Object.fromEntries(Object.entries(input).map(([key, entry]) => [key, copyPlain(entry)]))
	}
	return input
}

it("gives the same answer as Equal.equals for any two values", function () {
	fc.assert(
		fc.property(value, value, (self, that) => selectionEquals(self, that) === Equal.equals(self, that)),
		{ numRuns: 2_000 }
	)
})

it("gives the same answer as Equal.equals for a fresh copy of a value", function () {
	fc.assert(
		fc.property(value, (self) => selectionEquals(self, copyPlain(self)) === Equal.equals(self, copyPlain(self))),
		{ numRuns: 2_000 }
	)
})

it("compares new rows built by a selector by content", function () {
	const todos = [
		{ id: "a", title: "Write docs" },
		{ id: "b", title: "Ship it" },
	]
	const select = () => todos.map((todo) => ({ id: todo.id, label: todo.title, tag: Option.some(todo.id) }))

	expect(selectionEquals(select(), select())).toBe(true)
	expect(selectionEquals(select(), [...select(), { id: "c", label: "New", tag: Option.none() }])).toBe(false)
	expect(selectionEquals({ ids: ["a"] }, { ids: ["b"] })).toBe(false)
})

it("leaves values with their own equality to Equal.equals", function () {
	expect(selectionEquals(new Point({ x: 1 }), new Point({ x: 1 }))).toBe(true)
	expect(selectionEquals({ x: 1 }, new Point({ x: 1 }))).toBe(false)
	expect(selectionEquals(new Date(1), new Date(1))).toBe(true)
	expect(selectionEquals(Number.NaN, Number.NaN)).toBe(true)
})

it("leaves a plain object with its own equality to Equal.equals", function () {
	const anyVersion = (version: number) => ({
		version,
		[Equal.symbol]: (that: unknown) => Equal.isEqual(that),
		[Hash.symbol]: () => 0,
	})

	expect(Equal.equals(anyVersion(1), anyVersion(2))).toBe(true)
	expect(selectionEquals(anyVersion(1), anyVersion(2))).toBe(true)
})

it("compares a by-reference object inside a plain selection by content", function () {
	const self = Equal.byReference({ x: 1 })
	const that = Equal.byReference({ x: 1 })

	expect(Equal.equals(self, that)).toBe(false)
	expect(selectionEquals(self, that)).toBe(true)
})
