import { Match, Result, Schema } from "effect"

/**
 * One delivery in a commit-source snapshot. Sources use its key and version to identify an
 * external Message so the Provider can avoid repeating its delivery.
 *
 * The key identifies an entry within its source. The version identifies the delivery,
 * independently of the Message object's identity.
 *
 * @category models
 * @since 0.1.0
 */
export interface CommitEntry<Message> {
	/**
	 * Identifies an entry within the source. Each snapshot must contain at most one entry for a
	 * key.
	 */
	readonly key: string
	/**
	 * Compared with the last successfully delivered version for this key using `Object.is`.
	 * Change it to request another delivery.
	 */
	readonly version: string | number
	readonly message: Message
}

/**
 * Adapter between an external data source and an application Provider. Use it to turn
 * external values into Messages during initialization and live updates.
 *
 * **Details**
 *
 * The Provider folds the initial snapshot during render, then commits changed entries after
 * activation. Successfully delivered versions remain recorded across reconnects. Removing a
 * key from a reconciled snapshot forgets its recorded version.
 *
 * **Gotchas**
 *
 * Reads and construction must not acquire resources. Acquire live resources in `subscribe` and
 * release them in its cleanup. Notifications during reconciliation must not recursively
 * publish another snapshot.
 *
 * @category models
 * @since 0.1.0
 */
export interface CommitSource<Message, E = never> {
	/**
	 * Reads the current snapshot synchronously. Returns source failures as `Result` data and
	 * performs no side effects.
	 */
	readonly getSnapshot: () => Result.Result<ReadonlyArray<CommitEntry<Message>>, E>
	/**
	 * Registers publication notifications and returns cleanup. After a notification,
	 * `getSnapshot` must expose the published snapshot.
	 */
	readonly subscribe: (notify: () => void) => () => void
}

/**
 * Failure caused by duplicate snapshot keys or a source notification during reconciliation.
 *
 * @category errors
 * @since 0.1.0
 */
export class CommitSourceError extends Schema.Error<CommitSourceError>("react-foldkit/React/CommitSourceError")({
	_tag: Schema.tag("CommitSourceError"),
	details: Schema.Union([
		Schema.Struct({
			reason: Schema.Literal("DuplicateKey"),
			key: Schema.String,
		}),
		Schema.Struct({
			reason: Schema.Literal("Reentrant"),
		}),
	]),
}) {
	get message(): string {
		return Match.value(this.details).pipe(
			Match.when(
				{
					reason: "DuplicateKey",
				},
				(failure) => "Duplicate source key: " + failure.key
			),
			Match.when(
				{
					reason: "Reentrant",
				},
				() => "Commit source notification is reentrant"
			),
			Match.exhaustive
		)
	}
}
