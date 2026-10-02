import { Schema } from "effect"
import { defineMessageUnion } from "../../src/message"
import type { CommitEntry, CommitSource } from "../../src/react"

export const Message = defineMessageUnion({ Received: { value: Schema.String }, Edited: {} })
export type Message = typeof Message.Type
export const entry = (key: string, version: string | number, value = key): CommitEntry<Message> => ({
	key,
	version,
	message: Message.Received({ value }),
})

export function fakeSource<Message>(initial: ReadonlyArray<CommitEntry<Message>> = []) {
	let snapshot = initial
	const listeners = new Set<() => void>()
	let subscriptions = 0
	let unsubscriptions = 0
	let onSubscribe: ((count: number) => void) | undefined
	let onUnsubscribe: ((count: number) => void) | undefined
	const notifications: Array<() => void> = []
	const source: CommitSource<Message> = {
		getSnapshot: () => snapshot,
		subscribe: (notify) => {
			subscriptions += 1
			listeners.add(notify)
			notifications.push(notify)
			onSubscribe?.(subscriptions)
			return () => {
				unsubscriptions += 1
				listeners.delete(notify)
				onUnsubscribe?.(unsubscriptions)
			}
		},
	}
	return {
		source,
		set(next: ReadonlyArray<CommitEntry<Message>>) {
			snapshot = next
		},
		publish(next: ReadonlyArray<CommitEntry<Message>>) {
			snapshot = next
			for (const listener of [...listeners]) listener()
		},
		notify() {
			for (const listener of [...listeners]) listener()
		},
		onSubscribe(callback: (count: number) => void) {
			onSubscribe = callback
		},
		onUnsubscribe(callback: (count: number) => void) {
			onUnsubscribe = callback
		},
		notifications,
		get listeners() {
			return listeners.size
		},
		get subscriptions() {
			return subscriptions
		},
		get unsubscriptions() {
			return unsubscriptions
		},
	}
}
