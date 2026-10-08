import { Scheduler } from "effect"

/**
 * Foldkit browser scheduling: default `setTimeout(0)` is clamped to ≥4ms in
 * browsers. Command / Subscription fiber yields use this microtask scheduler
 * instead so results land on the next tick.
 */
function microtaskSetImmediate(callback: () => void): () => void {
	let cancelled = false
	queueMicrotask(function () {
		if (!cancelled) callback()
	})
	return function () {
		cancelled = true
	}
}

export const browserScheduler = new Scheduler.MixedScheduler("async", microtaskSetImmediate)
