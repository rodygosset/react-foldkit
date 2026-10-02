import { Effect, Function, Match, Pipeable, Schema } from "effect"
import { Envelope, EnvelopeHeader, Receipt } from "./internal/loader-envelope"

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

export { Receipt } from "./internal/loader-envelope"
export type { Envelope } from "./internal/loader-envelope"

/** The adapter-facing part of a declaration; heterogeneous payloads stay private. */
export interface Declaration<out Message> extends Pipeable.Pipeable {
	readonly name: string
	readonly decode: (envelope: unknown) => Message
}

/** A typed loading program and its mapping into external Messages. */
export interface Loader<A, I, out Message = A> extends Declaration<Message> {
	readonly data: Schema.Codec<A, I>
	readonly key: (data: A) => string
	readonly toMessage: (data: A, receipt: Receipt) => Message
	readonly load: <E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<Envelope<I>, E | Schema.SchemaError, R>
}

export interface Config<A, I> {
	readonly name: string
	readonly data: Schema.Codec<A, I>
	readonly key: (data: NoInfer<A>) => string
}

class LoaderImpl<A, I, Message> extends Pipeable.Class implements Loader<A, I, Message> {
	readonly decode: (envelope: unknown) => Message

	constructor(
		readonly name: string,
		readonly data: Schema.Codec<A, I>,
		readonly key: (data: A) => string,
		readonly toMessage: (data: A, receipt: Receipt) => Message,
		readonly load: Loader<A, I, Message>["load"]
	) {
		super()
		const decode = Schema.decodeUnknownSync(
			Envelope(data)
				.pipe(Schema.fieldsAssign({ name: Schema.Literal(name) }))
				.check(
					Schema.makeFilter((envelope) => key(envelope.payload) === envelope.key, {
						message: "Loader resource key does not match its payload",
					})
				)
		)
		this.decode = (input) => {
			const { name, key, version, payload } = decode(input)
			return toMessage(payload, { name, key, version })
		}
	}
}

/** Declares a serializable payload without running its loading Effect. */
export function define<A, I>(config: Config<A, I> & { readonly toMessage?: never }): Loader<A, I>
export function define<A, I, Message>(
	config: Config<A, I> & { readonly toMessage: (data: NoInfer<A>, receipt: Receipt) => Message }
): Loader<A, I, Message>
export function define<A, I, Message>(
	config: Config<A, I> & { readonly toMessage?: (data: A, receipt: Receipt) => Message }
): Loader<A, I, A | Message> {
	const encode = Schema.encodeEffect(config.data)
	const load: Loader<A, I>["load"] = (effect) =>
		Effect.flatMap(effect, (data) =>
			Effect.map(encode(data), (payload) => ({
				_tag: EnvelopeHeader.fields._tag.literal,
				format: EnvelopeHeader.fields.format.literal,
				name: config.name,
				key: config.key(data),
				version: crypto.randomUUID(),
				payload,
			}))
		)
	return new LoaderImpl<A, I, A | Message>(
		config.name,
		config.data,
		config.key,
		config.toMessage ?? Function.identity,
		load
	)
}

/** Maps accepted deliveries while preserving loading, encoding, and receipt identity. */
export const mapMessages: {
	<Message, Next>(
		f: (message: Message, receipt: Receipt) => Next
	): <A, I>(self: Loader<A, I, Message>) => Loader<A, I, Next>
	<A, I, Message, Next>(
		self: Loader<A, I, Message>,
		f: (message: Message, receipt: Receipt) => Next
	): Loader<A, I, Next>
} = Function.dual(
	2,
	<A, I, Message, Next>(self: Loader<A, I, Message>, f: (message: Message, receipt: Receipt) => Next) =>
		new LoaderImpl(
			self.name,
			self.data,
			self.key,
			(data, receipt) => f(self.toMessage(data, receipt), receipt),
			self.load
		)
)
