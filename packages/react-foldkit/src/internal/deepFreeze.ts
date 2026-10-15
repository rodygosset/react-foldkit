import { Option, Predicate, Record } from "effect"

// Adapted from Foldkit's runtime/deepFreeze.ts, which Foldkit does not export.

declare const process: { readonly env: { readonly NODE_ENV?: string } }

/**
 * True outside production builds. Bundlers replace `process.env.NODE_ENV`; without a
 * replacement in a browser the lookup throws and the build counts as production.
 */
export const isDevelopment: boolean = (function () {
	try {
		return process.env.NODE_ENV !== "production"
	} catch {
		return false
	}
})()

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (!Predicate.isObject(value)) return false
	const prototype = Object.getPrototypeOf(value)
	return prototype === Object.prototype || prototype === null
}

/**
 * Freezes plain objects and arrays recursively so accidental Model mutation throws at the
 * write site. Effect values and class instances stay unfrozen because Effect memoizes hashes
 * on them; `Some` payloads are still walked. Frozen values are skipped, which also bounds the
 * cost to the branches an update replaced.
 */
export function deepFreeze<T>(value: T): T {
	if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value
	if (Array.isArray(value)) {
		Object.freeze(value)
		for (const item of value) deepFreeze(item)
		return value
	}
	if (Option.isOption(value)) {
		if (Option.isSome(value)) deepFreeze(value.value)
		return value
	}
	if (!isPlainObject(value)) return value
	Object.freeze(value)
	for (const item of Record.values(value)) deepFreeze(item)
	return value
}
