import { MutableList } from "effect"

/** Test-only synchronous drain of the real store's MessageChannel tasks. */
export function controlledDrains() {
	const tasks = MutableList.make<() => void>()
	class Channel {
		port1 = { close() {}, postMessage: () => MutableList.append(tasks, () => this.port2.onmessage?.()) }
		port2: { onmessage: (() => void) | null; close: () => void } = { onmessage: null, close() {} }
	}
	return {
		Channel,
		flush() {
			while (tasks.length) {
				const task = MutableList.take(tasks)
				if (task !== MutableList.Empty) task()
			}
		},
		flushNext() {
			const task = MutableList.take(tasks)
			if (task !== MutableList.Empty) task()
		},
		get pending() {
			return tasks.length
		},
	}
}
