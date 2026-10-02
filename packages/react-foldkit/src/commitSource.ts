import { Match, Schema } from "effect"

/** One accepted external value, identified independently of its Message object. */
export interface CommitEntry<Message> {
	readonly key: string
	readonly version: string | number
	readonly message: Message
}

/** Synchronous access to active values and their publication notifications. */
export interface CommitSource<Message> {
	readonly getSnapshot: () => ReadonlyArray<CommitEntry<Message>>
	readonly subscribe: (notify: () => void) => () => void
}

/** The initial snapshot must already have been folded into Provider init. */
export interface CommitSourceOptions<Message> {
	readonly source: CommitSource<Message>
	readonly initialSnapshot: ReadonlyArray<CommitEntry<Message>>
}

/** The source violated its identity or synchronous reconciliation contract. */
export class CommitSourceError extends Schema.Error<CommitSourceError>("react-foldkit/React/CommitSourceError")({
	_tag: Schema.tag("CommitSourceError"),
	reason: Schema.Literals(["DuplicateKey", "SourceChanged", "Reentrant"]),
	key: Schema.optional(Schema.String),
}) {
	get message(): string {
		return Match.value(this.reason).pipe(
			Match.when("DuplicateKey", () => "Duplicate source key: " + this.key),
			Match.when("SourceChanged", () => "Commit source identity must remain stable"),
			Match.when("Reentrant", () => "Commit source notification is reentrant"),
			Match.exhaustive
		)
	}
}
