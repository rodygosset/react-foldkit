import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Option, Queue } from "effect"
import type * as Command from "foldkit/command"
import { defineMessageUnion } from "foldkit/message"
import * as Store from "./store"

/**
 * `getRunningCommands` decides what React reactivation restarts. When deactivation disposes a
 * Store, the Provider reads this list to build `ReactivationContext.interrupted` and to pick the
 * Commands that `restartInterrupted` starts again. A finished Command left in the list runs a
 * second time. A missing entry is never restarted, and a misordered list restarts work out of
 * order.
 */

const Message = defineMessageUnion({
	RequestedFetch: {},
	RequestedFetchAndSave: {},
	CompletedFetch: {},
})
type Message = typeof Message.Type

/**
 * Builds a Command that reports its start on `started` and then waits for `release`. The Store
 * adds a Command to its running list before the Command's Effect begins, so a reported start
 * means the entry is already listed.
 */
const awaitingCommand = (
	name: string,
	started: Queue.Queue<string>,
	release: Deferred.Deferred<void>
): Command.Command<Message> => ({
	name,
	effect: Queue.offer(started, name).pipe(
		Effect.andThen(Deferred.await(release)),
		Effect.as(Message.CompletedFetch())
	),
})

describe("getRunningCommands", function () {
	it.live("removes a Command once it finishes", () =>
		Effect.gen(function* () {
			const started = yield* Queue.unbounded<string>()
			const release = yield* Deferred.make<void>()
			const fetch = awaitingCommand("Fetch", started, release)
			const store = yield* Store.make(
				{
					update: (completed: boolean, message: Message) => ({
						model: completed || message._tag === "CompletedFetch",
					}),
				},
				{ model: false, commands: [fetch] }
			)
			yield* Queue.take(started)
			expect(store.getRunningCommands()).toEqual([fetch])

			yield* Deferred.succeed(release, undefined)
			yield* Store.takeWhen(store, (completed) => (completed ? Option.some(completed) : Option.none()))

			expect(store.getRunningCommands()).toEqual([])
		})
	)

	// React reads this list in the same tick that it deactivates a Provider. A Command forked by a
	// Message in that tick has not started yet, but it must still count as interrupted.
	it.live("lists a Command from the moment it is forked", () =>
		Effect.gen(function* () {
			const started = yield* Queue.unbounded<string>()
			const release = yield* Deferred.make<void>()
			const fetch = awaitingCommand("Fetch", started, release)
			const store = yield* Store.make(
				{
					update: (model: number, message: Message) =>
						message._tag === "RequestedFetch" ? { model, commands: [fetch] } : { model },
				},
				{ model: 0 }
			)

			yield* Store.commit(store, Message.RequestedFetch())

			expect(yield* Queue.size(started)).toBe(0)
			expect(store.getRunningCommands()).toEqual([fetch])
		})
	)

	it.live("lists each start of the same Command value separately", () =>
		Effect.gen(function* () {
			const started = yield* Queue.unbounded<string>()
			const release = yield* Deferred.make<void>()
			const fetch = awaitingCommand("Fetch", started, release)
			const store = yield* Store.make(
				{
					update: (model: number, message: Message) =>
						message._tag === "RequestedFetch" ? { model, commands: [fetch] } : { model },
				},
				{ model: 0 }
			)

			yield* Store.commit(store, Message.RequestedFetch())
			yield* Store.commit(store, Message.RequestedFetch())
			yield* Queue.takeN(started, 2)

			expect(store.getRunningCommands()).toEqual([fetch, fetch])
		})
	)

	it.live("lists Commands in the order they started", () =>
		Effect.gen(function* () {
			const started = yield* Queue.unbounded<string>()
			const release = yield* Deferred.make<void>()
			const fetch = awaitingCommand("Fetch", started, release)
			const save = awaitingCommand("Save", started, release)
			const store = yield* Store.make(
				{
					update: (model: number, message: Message) =>
						message._tag === "RequestedFetchAndSave" ? { model, commands: [fetch, save] } : { model },
				},
				{ model: 0 }
			)

			yield* Store.commit(store, Message.RequestedFetchAndSave())

			expect(yield* Queue.takeN(started, 2)).toEqual(["Fetch", "Save"])
			expect(store.getRunningCommands()).toEqual([fetch, save])
		})
	)
})
