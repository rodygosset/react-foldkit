import { Effect, Exit, HashMap, Option, Result, type Scope } from "effect"
import type { CommitError } from "../store"

import { CommitSourceError, type CommitEntry, type CommitSource, type CommitSourceOptions } from "../commitSource"

export { CommitSourceError } from "../commitSource"
export type { CommitEntry, CommitSource, CommitSourceOptions } from "../commitSource"

type Versions = HashMap.HashMap<string, string | number>
type ConnectionError = CommitSourceError | CommitError

export interface Connection<Message> {
	readonly source: CommitSource<Message>
	readonly connect: (
		commit: (message: Message) => Result.Result<void, CommitError>
	) => Effect.Effect<void, ConnectionError, Scope.Scope>
}

function versions<Message>(snapshot: ReadonlyArray<CommitEntry<Message>>): Result.Result<Versions, CommitSourceError> {
	let result = HashMap.empty<string, string | number>()
	for (const { key, version } of snapshot) {
		if (HashMap.has(result, key)) return Result.fail(new CommitSourceError({ reason: "DuplicateKey", key }))
		result = HashMap.set(result, key, version)
	}
	return Result.succeed(result)
}

/** Retains only successfully delivered tokens across scoped connection lifetimes. */
export const make = <Message>(
	options: CommitSourceOptions<Message>
): Result.Result<Connection<Message>, CommitSourceError> =>
	Result.map(versions(options.initialSnapshot), function (baseline) {
		const { source } = options
		let previous = baseline
		let reconciling = false

		const connect: Connection<Message>["connect"] = (commit) =>
			Effect.gen(function* () {
				let connected = true
				let subscribing = true
				let setupExit: Exit.Exit<void, ConnectionError> = Exit.void

				const reconcile: Effect.Effect<void, ConnectionError> = Effect.suspend(function () {
					if (!connected) return Effect.void
					if (reconciling) return Effect.fail(new CommitSourceError({ reason: "Reentrant" }))
					reconciling = true
					return Effect.gen(function* () {
						const snapshot = yield* Effect.sync(() => source.getSnapshot())
						const next = yield* Effect.fromResult(versions(snapshot))
						previous = HashMap.filter(previous, (_, key) => HashMap.has(next, key))
						for (const entry of snapshot) {
							if (!connected) return
							const version = HashMap.get(previous, entry.key)
							if (Option.isSome(version) && Object.is(version.value, entry.version)) continue
							yield* Effect.fromResult(commit(entry.message))
							previous = HashMap.set(previous, entry.key, entry.version)
						}
					}).pipe(
						Effect.ensuring(
							Effect.sync(function () {
								reconciling = false
							})
						)
					)
				})

				yield* Effect.acquireRelease(
					Effect.sync(() =>
						source.subscribe(function () {
							if (!connected) return
							if (!subscribing) return Effect.runSync(reconcile)
							// Capture failure until subscribe returns the cleanup handle.
							setupExit = Effect.runSyncExit(reconcile)
							if (Exit.isFailure(setupExit)) connected = false
						})
					),
					(unsubscribe) =>
						Effect.sync(function () {
							connected = false
							unsubscribe()
						})
				)
				subscribing = false
				yield* setupExit
				yield* reconcile
			})
		return { source, connect }
	})
