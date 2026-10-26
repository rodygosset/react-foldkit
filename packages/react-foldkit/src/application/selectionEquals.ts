import { Equal, Equivalence, Predicate } from "effect"

function isPlainRecord(input: unknown): input is Readonly<Record<PropertyKey, unknown>> {
	if (!Predicate.isObject(input) || Equal.isEqual(input)) return false
	const prototype = Object.getPrototypeOf(input)
	return prototype === Object.prototype || prototype === null
}

/**
 * Gives the same answer as `Equal.equals`, but walks plain arrays and plain objects directly.
 * `Equal.equals` hashes both values before it compares them, and a selection built during the
 * selector is new on every Model change, so its hash is never cached. Every other value, such as
 * an `Option`, a `Data` class, or a `Date`, still goes to `Equal.equals`. One difference: an
 * object marked with `Equal.byReference` inside a plain selection is compared by content.
 */
export const selectionEquals: Equivalence.Equivalence<unknown> = Equivalence.make(function (self, that) {
	if (Array.isArray(self)) return Array.isArray(that) && arrayEquals(self, that)
	if (isPlainRecord(self)) return isPlainRecord(that) && recordEquals(self, that)
	return Equal.equals(self, that)
})

const arrayEquals = Equivalence.Array(selectionEquals)
const recordEquals = Equivalence.Record(selectionEquals)
