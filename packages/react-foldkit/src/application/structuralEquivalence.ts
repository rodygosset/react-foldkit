import { Equal, Equivalence, Predicate } from "effect"

/**
 * Gives the same answer as `Equal.equals`, but walks arrays and object literals directly.
 * `Equal.equals` hashes both values before it compares them, and a selection built during the
 * selector is new on every Model change, so its hash is never cached. Every other value, such as
 * an `Option`, a `DateTime`, or a `Map`, still goes to `Equal.equals`. The one difference is that
 * an object marked with `Equal.byReference` inside a selection is compared by content.
 */
export const structuralEquivalence: Equivalence.Equivalence<unknown> = Equivalence.make(function (self, that) {
	if (Array.isArray(self)) return Array.isArray(that) && arrayEquivalence(self, that)
	if (Equal.isEqual(self) || Equal.isEqual(that)) return Equal.equals(self, that)
	if (
		Predicate.isObject(self) &&
		Predicate.isObject(that) &&
		Object.getPrototypeOf(self) === Object.prototype &&
		Object.getPrototypeOf(that) === Object.prototype
	)
		return recordEquivalence(self, that)
	return Equal.equals(self, that)
})

const arrayEquivalence = Equivalence.Array(structuralEquivalence)
const recordEquivalence = Equivalence.Record(structuralEquivalence)
