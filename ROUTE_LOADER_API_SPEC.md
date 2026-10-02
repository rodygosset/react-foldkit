# External data delivery

> **Superseded for composition.** The contract of record for Loader declarations,
> `mapMessages`, TanStack registry wiring, and Provider `commitSource` is
> [COMMIT_SOURCE_COMPOSITION_SPEC.md](COMMIT_SOURCE_COMPOSITION_SPEC.md).
> Keep this document for historical delivery timing and Query settlement notes.
> Do not follow the app-owned adapter or `useCommitSource` sketches below.

Implemented: commit/source APIs, `Query.settle`, and child views.
See [validation](COMMIT_SOURCE_VALIDATION.md). The Foldkit backport is deferred.

This spec records the delivery contract and earlier app-owned adapter. Public
loader composition lives in the composition spec. The delivery timing contract
still applies.

## Ownership and timing

Accepted route data must reach the root Model before the page's first server,
hydration, or navigation render. Preloads leave the Model untouched.

Features define Models, Messages, updates, and loading Effects. The app embeds
them and checks relevance/freshness. ReactFoldkit delivers Messages synchronously;
the adapter must publish accepted data before the page renders.

## Query settlement

- `query.settle(model, result)` and `keyedQuery.settle(model, args, result)`
  return service-free `Update.Return`. Both support data-last steps.
- Success/Failure use `AsyncData.settle`; Failure keeps known data as Stale.
  Other variants are ignored: a pending state without a Fetch would never finish.
- Settlement advances request identity, clears the pending ID, and may interrupt
  the old Fetch. Its request ID prevents delayed cancellation from stopping a newer Fetch.
- `query.lift(...).settle` updates the containing Model and lifts Commands.
- Reuse `query.Model.fields.data` or
  `keyedQuery.Model.fields.slots.value.fields.data` for result Schemas.
  `Query.run` produces Success/Failure in the existing public AsyncData type.

For example, Search can keep its active query alongside a Query Model.
Supply the domain Schemas and `fetchSpecimens`:

```ts
// features/specimen-search/model.ts
import { Effect, Option, Schema } from "effect"
import { defineMessageUnion } from "react-foldkit/message"
import * as Query from "react-foldkit/query"
import { modifyFields } from "react-foldkit/struct"
import type * as Update from "react-foldkit/update"

export const searchQuery = Query.define({
	name: "SpecimenSearch",
	args: { query: SearchListQuery },
	data: SpecimenSearchResponse,
	error: Schema.String,
	execute: ({ query }) => fetchSpecimens(query),
})

export const Model = Schema.Struct({
	activeQuery: Schema.Option(SearchListQuery),
	results: searchQuery.Model,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
	GotQueryMessage: { message: searchQuery.Message },
	LoadedFromRoute: {
		query: SearchListQuery,
		result: searchQuery.Model.fields.slots.value.fields.data,
	},
})
export type Message = typeof Message.Type

const resultsChild = searchQuery.lift<Model, Message>({
	field: "results",
	toParentMessage: (message) => Message.GotQueryMessage({ message }),
})

export const init = (): Model => ({
	activeQuery: Option.none(),
	results: searchQuery.init("specimen-search"),
})

export type Requirements = Effect.Services<ReturnType<typeof searchQuery.run>>
type UpdateReturn = Update.Return<Model, Message, Requirements>

export const update = (model: Model, message: Message): UpdateReturn =>
	Message.match<UpdateReturn>(message, {
		GotQueryMessage: ({ message }) => resultsChild.fold(model, message),
		LoadedFromRoute: ({ query, result }) => {
			const settled = resultsChild.settle(model, { query }, result)
			return {
				...settled,
				model: modifyFields(settled.model, { activeQuery: () => Option.some(query) }),
			}
		},
	})

export const load = (query: SearchListQuery) =>
	Effect.map(searchQuery.run({ query }), (result) => Message.LoadedFromRoute({ query, result }))
```

Check freshness before settlement. Request IDs protect Query completions, but do
not order loader results. The composition example checks server revisions.

## Source protocol

```ts
export interface CommitEntry<Message> {
	readonly key: string
	readonly version: string | number
	readonly message: Message
}

export interface CommitSource<Message> {
	readonly getSnapshot: () => ReadonlyArray<CommitEntry<Message>>
	readonly subscribe: (notify: () => void) => () => void
}

export interface CommitSourceOptions<Message> {
	readonly source: CommitSource<Message>
	readonly initialSnapshot: ReadonlyArray<CommitEntry<Message>>
}
```

~~`defineApplication` exposes `useCommitSource(options)`, typed from update's Messages.~~
**Removed.** Bootstrap only through Provider `commitSource`. See the composition
spec and package README.

| Field             | Contract                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `key`             | Unique within the snapshot; duplicate keys fail validation. Snapshot order is delivery order. |
| `version`         | String/number compared with `Object.is`. Identifies a delivery, not authoritative freshness.  |
| `message`         | Typed root Message processed through normal update/Command handling.                          |
| `initialSnapshot` | Exact snapshot already folded into Provider init; consumed once as the delivery baseline.     |

A snapshot contains active, accepted entries. Unchanged key/version pairs are
skipped even if the Message changed. Observed removal clears the delivery record;
cached re-entry delivers again.

Reconnects compare the latest snapshot with delivery records. Missed values and
identical removal/re-entry while disconnected are unobservable; change the token
to make them visible. Keep the root connection live during navigation.

Keep the source and hook stable beneath the persistent Provider. Connections
start after activation, subscribe before rereading, and keep delivery records
across Strict Mode. Deliver changes since bootstrap. A child effect can run before
activation and lose those Messages.

Notifications expose the accepted snapshot synchronously; the callback commits
its Messages. Reconnecting later cannot fix an earlier render. Cleanup disables
callbacks; SSR does not subscribe.

## Tested TanStack adapter

The earlier fixture adapter read successful published matches and decoded an
app-owned envelope:

```ts
// app/router/commit-source.ts
import type { AnyRouter } from "@tanstack/react-router"
import type { CommitSource } from "react-foldkit/react"

export function makeTanStackSource(router: AnyRouter): CommitSource<App.Message> {
	return {
		getSnapshot: () =>
			router.stores.matches.get().flatMap((match) => {
				if (match.status !== "success") return []
				const envelope = LoadedRoute.read(match.loaderData)
				return Option.match(envelope, {
					onNone: () => [],
					onSome: ({ version, appMessage }) => [
						{
							key: match.id,
							version,
							message: appMessage,
						},
					],
				})
			}),
		subscribe: (notify) => {
			const subscription = router.stores.matches.subscribe(() => notify())
			return () => subscription.unsubscribe()
		},
	}
}
```

`LoadedRoute.read` ignores unrelated data and rejects malformed recognized envelopes.
The loader allocates one serializable token, preserved through caching and SSR.
Reads/renders reuse it; preloads create envelopes without delivering them.

The tested client store had `subscribe` but needed this local type augmentation:

```ts
// app/router/tanstack-store-types.d.ts
import type { Readable } from "@tanstack/react-store"
import type {} from "@tanstack/router-core"

declare module "@tanstack/router-core" {
	interface RouterReadableStore<TValue> extends Readable<TValue> {}
}
```

The server store is nonreactive. The public adapter now owns router compatibility.
Mount events missed revalidation; test other adapters' timing with real routers.

## Bootstrap

Prefer `Provider commitSource`. It validates and folds the initial snapshot through
update, preserves Commands, supplies the populated Model to SSR/hydration, and
connects after activation.

~~For manual connections, capture the snapshot once, fold it into init with its
Commands, and pass it to `useCommitSource({ source, initialSnapshot })`.
Do not connect the same source through both prop and hook.~~
**Removed.** There is no public `useCommitSource` hook. Use Provider
`commitSource` only.

Server/client sources need equivalent initial data and tokens. Keep the Provider
mounted across navigation and the source stable. Feature views read through a
projected child Provider.

## Synchronous commit

`store.commit(message)` and `useCommit()` return `Result<void, CommitError>`.
`Store.commit(store, message)` is the lazy `Effect<void, CommitError>` adapter.

- Success means update and store notifications completed. Rendering/Commands may follow.
- Commit drains FIFO through its own entry, bypassing the budget for that prefix.
  Later Messages keep normal scheduling; obsolete callbacks cannot replay work.
- Inactive, crashed, disposed, and reentrant commits fail. Calls during update or
  synchronous notification never enqueue; a crash before completion cannot report success.
- Validation returns Result. Delivery failures use the Effect error channel;
  callback exceptions are defects. Acquisition/release use connection scopes.
- Setup notification failures wait until cleanup is acquired. The Cause keeps
  setup/cleanup failures. At React/source callbacks, `runSync` throws the first
  failure; `runSyncExit` keeps the full Cause. Render contract checks also throw.

Commands stay asynchronous. Use dispatch for UI events; use commit when the host
needs the updated Model before proceeding.

## Coverage

Source tests cover bootstrap, tokens, duplicates, ordering, removal/re-entry,
reconnects, retries, and cleanup. Store tests cover queued work, reentrancy,
terminal states, obsolete callbacks, and Commands.

Router tests cover first renders, preloads, cancellation, cached return, Strict
Mode, and hydration. Chromium checks native scheduling. Query tests cover old
completions, cancellation races, sibling/optional isolation, types, and failed refresh.

See [route validation](ROUTE_LOADER_VALIDATION.md) for recorded versions and limits,
and [submodel views](REACT_SUBMODEL_API_SPEC.md) for projection composition.
