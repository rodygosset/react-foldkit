import { Match, Result, Schema } from "effect"

/** One accepted external value, identified independently of its Message object. */
export interface CommitEntry<Message> {
	readonly key: string
	readonly version: string | number
	readonly message: Message
}

/**
 * Synchronous snapshot reads and publication notifications. A snapshot that cannot be read
 * synchronously is a contract violation, so read failures are typed data rather than Effects.
 */
export interface CommitSource<Message, E = never> {
	readonly getSnapshot: () => Result.Result<ReadonlyArray<CommitEntry<Message>>, E>
	readonly subscribe: (notify: () => void) => () => void
}

/** The initial snapshot must already have been folded into Provider init. */
export interface CommitSourceOptions<Message, E = never> {
	readonly source: CommitSource<Message, E>
	readonly initialSnapshot: ReadonlyArray<CommitEntry<Message>>
}

/** The source violated its synchronous reconciliation contract. */
export class CommitSourceError extends Schema.Error<CommitSourceError>("react-foldkit/React/CommitSourceError")({
	_tag: Schema.tag("CommitSourceError"),
	reason: Schema.Literals(["DuplicateKey", "Reentrant"]),
	key: Schema.optional(Schema.String),
}) {
	get message(): string {
		return Match.value(this.reason).pipe(
			Match.when("DuplicateKey", () => "Duplicate source key: " + this.key),
			Match.when("Reentrant", () => "Commit source notification is reentrant"),
			Match.exhaustive
		)
	}
}
