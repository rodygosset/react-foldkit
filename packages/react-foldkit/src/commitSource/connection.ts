import { Effect, Exit, HashMap, MutableRef, Option, Result, type Scope } from "effect"
import type { CommitError } from "../store"

import { CommitSourceError, DuplicateKey, ReentrantNotification, type CommitEntry, type CommitSource } from "./public"

export { CommitSourceError, DuplicateKey, ReentrantNotification } from "./public"
export type { CommitEntry, CommitSource } from "./public"

type Versions = HashMap.HashMap<string, string | number>
export type ConnectionError<E> = E | CommitSourceError | CommitError

export interface Connection<Message, E = never> {
	readonly source: CommitSource<Message, E>
	readonly connect: (
		commit: (message: Message) => Result.Result<void, CommitError>,
		onReconcile: (exit: Exit.Exit<void, ConnectionError<E>>) => void
	) => Effect.Effect<void, ConnectionError<E>, Scope.Scope>
}

function versions<Message>(snapshot: ReadonlyArray<CommitEntry<Message>>): Result.Result<Versions, CommitSourceError> {
	let result = HashMap.empty<string, string | number>()
	for (const { key, version } of snapshot) {
		if (HashMap.has(result, key)) return Result.fail(new CommitSourceError({ reason: new DuplicateKey({ key }) }))
		result = HashMap.set(result, key, version)
	}
	return Result.succeed(result)
}

const reentrant: Result.Result<void, CommitSourceError> = Result.fail(
	new CommitSourceError({ reason: new ReentrantNotification() })
)

/** Whether a reconciliation is running, and whether the source notified during it. */
type Delivery = "Idle" | "Delivering" | "Reentered"

export const make = <Message, E>(options: {
	readonly source: CommitSource<Message, E>
	readonly initialSnapshot: ReadonlyArray<CommitEntry<Message>>
}): Result.Result<Connection<Message, E>, CommitSourceError> =>
	Result.map(versions(options.initialSnapshot), function (baseline) {
		const { source } = options
		// Delivered versions outlive each connection, so a reconnect does not deliver them again.
		let delivered = baseline

		const connect: Connection<Message, E>["connect"] = (commit, onReconcile) =>
			Effect.gen(function* () {
				// MutableRef reads stay fresh after a commit runs a nested notification.
				const delivery = MutableRef.make<Delivery>("Idle")
				const released = MutableRef.make(false)
				// Collects notifications that arrive before subscribe returns. They fail setup instead.
				let setupExits: Array<Exit.Exit<void, ConnectionError<E>>> | undefined = []

				const deliver = (): Result.Result<void, ConnectionError<E>> =>
					Result.gen(function* () {
						const snapshot = yield* source.getSnapshot()
						if (MutableRef.get(delivery) === "Reentered") return yield* reentrant
						const next = yield* versions(snapshot)
						delivered = HashMap.filter(delivered, (_, key) => HashMap.has(next, key))
						for (const entry of snapshot) {
							if (MutableRef.get(released)) return undefined
							const version = HashMap.get(delivered, entry.key)
							if (Option.isSome(version) && Object.is(version.value, entry.version)) continue
							yield* commit(entry.message)
							// A delivered Message stays delivered even if it reentered the source.
							delivered = HashMap.set(delivered, entry.key, entry.version)
							if (MutableRef.get(delivery) === "Reentered") return yield* reentrant
						}
						return undefined
					})

				const reconcile = Effect.suspend(() =>
					MutableRef.get(delivery) === "Idle"
						? Effect.acquireUseRelease(
								Effect.sync(() => MutableRef.set(delivery, "Delivering")),
								() => Effect.suspend(() => Effect.fromResult(deliver())),
								() => Effect.sync(() => MutableRef.set(delivery, "Idle"))
							)
						: Effect.fromResult(reentrant)
				)

				yield* Effect.acquireRelease(
					Effect.sync(() =>
						source.subscribe(function () {
							if (MutableRef.get(delivery) !== "Idle") return void MutableRef.set(delivery, "Reentered")
							if (MutableRef.get(released)) return
							const exit = Effect.runSyncExit(reconcile)
							if (setupExits === undefined) onReconcile(exit)
							else setupExits.push(exit)
						})
					),
					(unsubscribe) =>
						Effect.sync(function () {
							MutableRef.set(released, true)
							unsubscribe()
						})
				)
				yield* Exit.asVoidAll(setupExits)
				setupExits = undefined
				// Catch up on anything published after subscribe returned its handle.
				yield* reconcile
			})

		return { source, connect }
	})
