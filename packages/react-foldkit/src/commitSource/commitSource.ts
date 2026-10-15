import { type Result, Schema } from "effect"

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
 * The `CommitSourceError` reason when a snapshot contains more than one entry for a key.
 *
 * @see {@link CommitSourceError} for the failure that carries it
 * @category errors
 * @since 0.1.0
 */
export class DuplicateKey extends Schema.Error<DuplicateKey>("react-foldkit/CommitSource/DuplicateKey")({
	_tag: Schema.tag("DuplicateKey"),
	key: Schema.String,
}) {}

/**
 * The `CommitSourceError` reason when a source notifies while the Provider is still reconciling
 * its previous notification.
 *
 * @see {@link CommitSourceError} for the failure that carries it
 * @category errors
 * @since 0.1.0
 */
export class ReentrantNotification extends Schema.Error<ReentrantNotification>(
	"react-foldkit/CommitSource/ReentrantNotification"
)({
	_tag: Schema.tag("ReentrantNotification"),
}) {}

/**
 * Failure caused by duplicate snapshot keys or a source notification during reconciliation.
 * Handle one reason with `Effect.catchReason("CommitSourceError", "DuplicateKey", ...)`.
 *
 * @category errors
 * @since 0.1.0
 */
export class CommitSourceError extends Schema.Error<CommitSourceError>("react-foldkit/React/CommitSourceError")({
	_tag: Schema.tag("CommitSourceError"),
	reason: Schema.Union([DuplicateKey, ReentrantNotification]),
}) {
	get message(): string {
		return this.reason._tag === "DuplicateKey"
			? "Duplicate source key: " + this.reason.key
			: "Commit source notification is reentrant"
	}
}
