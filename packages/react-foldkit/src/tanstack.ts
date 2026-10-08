import type { AnyRouter } from "@tanstack/react-router"
import type { Readable } from "@tanstack/react-store"
import { HashMap, Option, Predicate, Result, Schema } from "effect"
import type { CommitEntry, CommitSource } from "./commitSource"
import type { Declaration } from "./loader"
import { EnvelopeHeader } from "./loader/envelope"

/**
 * Failure from creating a TanStack commit source with duplicate declaration names.
 *
 * @see {@link make} for building the registry
 * @category errors
 * @since 0.1.0
 */
export class RegistryError extends Schema.Error<RegistryError>("react-foldkit/TanStack/RegistryError")({
	_tag: Schema.tag("RegistryError"),
	declarationName: Schema.String,
}) {
	get message(): string {
		return "Duplicate loader declaration: " + this.declarationName
	}
}

type MessageOfDeclaration<D> = D extends Declaration<infer Message> ? Message : never

const EntryKey = Schema.Tuple([Schema.String, Schema.String, Schema.String]).pipe(Schema.fromJsonString)
const encodeEntryKey = Schema.encodeResult(EntryKey)

/**
 * Creates a commit source that turns TanStack Router loader data into application Messages.
 * Pass the source as the application Provider's `commitSource` so loaded route data reaches update.
 *
 * Register the Loader declarations used by your routes. For each successful route match, the
 * source decodes loader data with the declaration whose name matches the envelope. Other
 * loader data and envelopes with unregistered names are ignored.
 *
 * **Details**
 *
 * Duplicate declaration names return `RegistryError` when you create the source. Malformed
 * envelope names and validation failures for registered declarations return `SchemaError`
 * from `getSnapshot`. Exceptions from your key or Message callbacks remain thrown exceptions.
 *
 * Creating the source does not load routes or subscribe to the router. The Provider owns the
 * subscription and removes it on deactivation. Subscription requires a reactive matches store
 * and throws if the router does not provide one.
 *
 * **Example** (Delivering a route's loaded project)
 *
 * ```ts
 * import { createRootRoute, createRouter } from "@tanstack/react-router"
 * import { Effect, Result, Schema } from "effect"
 * import * as Loader from "react-foldkit/loader"
 * import { defineMessageUnion } from "react-foldkit/message"
 * import * as TanStack from "react-foldkit/tanstack"
 *
 * const Project = Schema.Struct({ id: Schema.String, title: Schema.String })
 *
 * const Message = defineMessageUnion({ LoadedProject: { project: Project } })
 *
 * const loader = Loader.define({ name: "Project", data: Project, key: (project) => project.id })
 *
 * const declaration = loader.pipe(Loader.mapMessages((project) => Message.LoadedProject({ project })))
 *
 * const route = createRootRoute({
 * 	loader: () => Effect.runPromise(loader.load(Effect.succeed({ id: "p1", title: "Foldkit" }))),
 * })
 *
 * const router = createRouter({ routeTree: route })
 *
 * export const commitSource = Result.getOrThrow(TanStack.make(router, [declaration]))
 * ```
 *
 * @see {@link RegistryError} for duplicate declaration names
 * @category constructors
 * @since 0.1.0
 */
export function make<const D extends ReadonlyArray<Declaration<unknown>>>(
	router: AnyRouter,
	declarations: D
): Result.Result<CommitSource<MessageOfDeclaration<D[number]>, Schema.SchemaError>, RegistryError>
export function make(
	router: AnyRouter,
	declarations: ReadonlyArray<Declaration<unknown>>
): Result.Result<CommitSource<unknown, Schema.SchemaError>, RegistryError> {
	const source = Result.gen(function* () {
		let registry = HashMap.empty<string, Declaration<unknown>>()
		for (const declaration of declarations) {
			if (HashMap.has(registry, declaration.name)) {
				return yield* Result.fail(
					new RegistryError({
						declarationName: declaration.name,
					})
				)
			}
			registry = HashMap.set(registry, declaration.name, declaration)
		}
		const decodeName = Schema.decodeUnknownResult(Schema.String)
		type Matches = ReturnType<typeof router.stores.matches.get>
		type Snapshot = Result.Result<ReadonlyArray<CommitEntry<unknown>>, Schema.SchemaError>
		let cached: { readonly matches: Matches; readonly snapshot: Snapshot } | undefined
		const readMatches = (matches: Matches): Snapshot =>
			Result.gen(function* () {
				const entries: Array<CommitEntry<unknown>> = []
				for (const match of matches) {
					const input: unknown = match.loaderData
					if (
						match.status !== "success" ||
						!Predicate.hasProperty(input, "_tag") ||
						input._tag !== EnvelopeHeader.fields._tag.schema.literal
					)
						continue
					const name = yield* decodeName(Predicate.hasProperty(input, "name") ? input.name : undefined)
					const declaration = HashMap.get(registry, name)
					if (Option.isNone(declaration)) continue
					const { receipt, message } = yield* declaration.value.decodeDelivery(input)
					entries.push({
						key: yield* encodeEntryKey([match.id, receipt.name, receipt.key]),
						version: receipt.version,
						message,
					})
				}
				return entries
			})
		return {
			getSnapshot() {
				const matches = router.stores.matches.get()
				if (cached !== undefined && cached.matches === matches) return cached.snapshot
				const snapshot = readMatches(matches)
				cached = { matches, snapshot }
				return snapshot
			},
			subscribe(notify) {
				const store = router.stores.matches
				if (!Predicate.hasProperty(store, "subscribe") || !Predicate.isFunction(store.subscribe)) {
					throw new Error("TanStack CommitSource requires a reactive matches store")
				}
				const reactive = store as typeof store & Pick<Readable<Matches>, "subscribe">
				const subscription = reactive.subscribe(() => notify())
				return () => subscription.unsubscribe()
			},
		} satisfies CommitSource<unknown, Schema.SchemaError>
	})
	return source
}
