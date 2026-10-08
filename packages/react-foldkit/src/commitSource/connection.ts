import { Cause, Effect, Exit, HashMap, Option, Result, type Scope } from "effect"
import type { CommitError } from "../store"

import { CommitSourceError, type CommitEntry, type CommitSource } from "./public"

export { CommitSourceError } from "./public"
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
		if (HashMap.has(result, key))
			return Result.fail(new CommitSourceError({ details: { reason: "DuplicateKey", key } }))
		result = HashMap.set(result, key, version)
	}
	return Result.succeed(result)
}

const reentrant: Result.Result<void, CommitSourceError> = Result.fail(
	new CommitSourceError({ details: { reason: "Reentrant" } })
)

type Phase = "Subscribing" | "Notifying" | "Reentered" | "Connected" | "Released"

export const make = <Message, E>(options: {
	readonly source: CommitSource<Message, E>
	readonly initialSnapshot: ReadonlyArray<CommitEntry<Message>>
}): Result.Result<Connection<Message, E>, CommitSourceError> =>
	Result.map(versions(options.initialSnapshot), function (baseline) {
		const { source } = options
		let previous = baseline

		const connect: Connection<Message, E>["connect"] = (commit, onReconcile) =>
			Effect.gen(function* () {
				// Held in a cell so reads inside the reconcile loops stay widened: a nested
				// publication writes it from outside the current control flow.
				const cell: { phase: Phase } = { phase: "Subscribing" }
				const phase = (): Phase => cell.phase
				let setup: Exit.Exit<void, ConnectionError<E>> = Exit.void

				const deliver = (): Result.Result<void, ConnectionError<E>> =>
					Result.gen(function* () {
						const snapshot = yield* source.getSnapshot()
						if (phase() === "Reentered") return yield* reentrant
						const next = yield* versions(snapshot)
						previous = HashMap.filter(previous, (_, key) => HashMap.has(next, key))
						for (const entry of snapshot) {
							if (phase() === "Released") return undefined
							const version = HashMap.get(previous, entry.key)
							if (Option.isSome(version) && Object.is(version.value, entry.version)) continue
							yield* commit(entry.message)
							// A delivered Message stays delivered even if it reentered the source.
							previous = HashMap.set(previous, entry.key, entry.version)
							if (phase() === "Reentered") return yield* reentrant
						}
						return undefined
					})

				function reconcile(): Result.Result<void, ConnectionError<E>> {
					if (phase() === "Released") return Result.void
					if (phase() === "Notifying" || phase() === "Reentered") return reentrant
					const resume = phase()
					cell.phase = "Notifying"
					try {
						return deliver()
					} finally {
						if (phase() === "Notifying" || phase() === "Reentered") cell.phase = resume
					}
				}

				yield* Effect.acquireRelease(
					Effect.sync(() =>
						source.subscribe(function () {
							const current = phase()
							if (current === "Notifying" || current === "Reentered") {
								cell.phase = "Reentered"
								return
							}
							if (current === "Released") return
							const exit = Effect.runSyncExit(Effect.suspend(() => Effect.fromResult(reconcile())))
							if (current === "Subscribing") {
								// Subscribe must return its cleanup handle before a notification can fail setup.
								if (Exit.isFailure(exit)) {
									setup = Exit.isFailure(setup)
										? Exit.failCause(Cause.combine(setup.cause, exit.cause))
										: exit
								}
								return
							}
							onReconcile(exit)
						})
					),
					(unsubscribe) =>
						Effect.sync(function () {
							cell.phase = "Released"
							unsubscribe()
						})
				)
				yield* setup
				cell.phase = "Connected"
				// Catch up on anything published after subscribe returned its handle.
				yield* Effect.suspend(() => Effect.fromResult(reconcile()))
			})

		return { source, connect }
	})
