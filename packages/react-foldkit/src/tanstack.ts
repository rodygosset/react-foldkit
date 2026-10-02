import type { AnyRouter } from "@tanstack/react-router"
import type { Readable } from "@tanstack/react-store"
import { HashMap, Option, Predicate, Result, Schema } from "effect"
import type { CommitEntry, CommitSource } from "./commitSource"
import { mapMessages, type Declaration, type Receipt } from "./loader"
import { EnvelopeHeader } from "./internal/loader-envelope"

// The tested router exposes Readable at runtime but omits the React-store augmentation.
declare module "@tanstack/router-core" {
	interface RouterReadableStore<TValue> extends Readable<TValue> {}
}

export class RegistryError extends Schema.Error<RegistryError>("react-foldkit/TanStack/RegistryError")({
	_tag: Schema.tag("RegistryError"),
	declarationName: Schema.String,
}) {
	get message(): string {
		return "Duplicate loader declaration: " + this.declarationName
	}
}

type MessageOfEntry<E> = E extends readonly [any, (message: any, receipt: Receipt) => infer Message]
	? Message
	: E extends Declaration<infer Message>
		? Message
		: never

/** A declaration or a `[declaration, mapMessages]` pair for the TanStack registry. */
export type RegistryEntry =
	| Declaration<unknown>
	| readonly [Declaration<any>, (message: any, receipt: Receipt) => any]

const encodeEntryKey = Schema.Tuple([Schema.String, Schema.String, Schema.String]).pipe(
	Schema.fromJsonString,
	Schema.encodeSync
)

function normalizeEntry(entry: RegistryEntry): Declaration<unknown> {
	if (Array.isArray(entry)) {
		const [declaration, mapMessage] = entry
		return declaration.pipe(mapMessages(mapMessage))
	}
	return entry as Declaration<unknown>
}

/** Reads accepted matches through one synchronous router-store subscription. */
export function make<
	const D extends ReadonlyArray<
		Declaration<unknown> | readonly [Declaration<any>, (message: any, receipt: Receipt) => any]
	>,
>(router: AnyRouter, declarations: D): CommitSource<MessageOfEntry<D[number]>>
export function make(router: AnyRouter, declarations: ReadonlyArray<RegistryEntry>): CommitSource<unknown> {
	const normalized = declarations.map(normalizeEntry)
	const registry = Result.gen(function* () {
		let registry = HashMap.empty<string, Declaration<unknown>>()
		for (const declaration of normalized) {
			if (HashMap.has(registry, declaration.name)) {
				return yield* Result.fail(new RegistryError({ declarationName: declaration.name }))
			}
			registry = HashMap.set(registry, declaration.name, declaration)
		}
		return registry
	}).pipe(Result.getOrThrow)
	const decodeHeader = Schema.decodeUnknownSync(EnvelopeHeader)
	const decodeName = Schema.decodeUnknownSync(Schema.String)
	return {
		getSnapshot: () => {
			const entries: Array<CommitEntry<unknown>> = []
			for (const match of router.stores.matches.get()) {
				const input: unknown = match.loaderData
				if (
					match.status !== "success" ||
					!Predicate.hasProperty(input, "_tag") ||
					input._tag !== EnvelopeHeader.fields._tag.literal
				)
					continue
				const name = decodeName(Predicate.hasProperty(input, "name") ? input.name : undefined)
				const declaration = HashMap.get(registry, name)
				if (Option.isNone(declaration)) continue
				const envelope = decodeHeader(input)
				entries.push({
					key: encodeEntryKey([match.id, envelope.name, envelope.key]),
					version: envelope.version,
					message: declaration.value.decode(input),
				})
			}
			return entries
		},
		subscribe: (notify) => {
			const subscription = router.stores.matches.subscribe(() => notify())
			return () => subscription.unsubscribe()
		},
	}
}
