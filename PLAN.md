# ReactFoldkit plan

One root Model holds application state. Child Providers read it through
projections; external data arrives as Messages.

## Status

Implemented:

- Synchronous `Store.commit` and `useCommit`.
- Optional `Provider commitSource` for bootstrap and later deliveries.
- Child view bindings through `defineSubmodel`, `useSubmodel`, and
  `useOptionalSubmodel`, plus `SubmodelProvider`.
- `Query.settle` / `settleIf`, lifted forms, and request-specific Fetch interruption.
- Public `Query.AsyncData` (Foldkit-native) plus Loader-owned `Load` / `settleIfLoad`.
- Loader module (`define`, overloaded `fromQuery`, dual `load` / `loadQuery`, `mapMessages`),
  protocol-only `CommitSource`, and the optional TanStack adapter (pipe `mapMessages` registry).

Earlier validation: 177 package tests, two Chromium tests, package/workspace
typechecks, declaration build, and emitted API checks. See
[commit/source validation](COMMIT_SOURCE_VALIDATION.md) and
[route validation](ROUTE_LOADER_VALIDATION.md).

The [composition spec](COMMIT_SOURCE_COMPOSITION_SPEC.md) replaces the app-owned
adapter design in [the route-loader spec](ROUTE_LOADER_API_SPEC.md).

## Contracts to preserve

| Area    | Contract                                                                                                                          |
| ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Store   | Commit drains FIFO through its own queue entry. Commands stay asynchronous; later Messages keep normal scheduling.                |
| Source  | Synchronous snapshots, scalar tokens, delivery records kept across reconnects, and scoped cleanup.                                |
| Views   | One root store; child Providers project it without copying state or running update.                                               |
| Queries | External settlement invalidates older Fetches and retains good data on failure. Delayed cancellation cannot stop a newer request. |
| Routing | Accepted loader data reaches the Model before the page renders. Preloads and canceled destinations leave it unchanged.            |
| SSR     | Per-request state; equivalent server/hydration Models and transported delivery tokens.                                            |

Test each adapter's delivery timing with a real router and browser scheduler.
The tested adapter reads published matches; mount events missed revalidation.
Page effects run too late to guarantee the first render has the data.

Tokens prevent duplicate delivery. Update decides whether the data is fresh
and relevant.

## Deferred Foldkit backport

Consider backporting `Query.settle` and its lifted forms to Foldkit, for example
to install a save response while an older GET is pending.

Keep React bindings, store delivery, and router integration in ReactFoldkit.
Preserve public contracts and pass behavior/type tests in both repositories.
