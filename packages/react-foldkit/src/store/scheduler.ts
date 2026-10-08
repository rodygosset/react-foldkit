import { Scheduler } from "effect"

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
