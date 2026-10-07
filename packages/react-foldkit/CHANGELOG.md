# Changelog

## Unreleased

### Added

- `Loader.Delivery` and `decodeDelivery` return the validated receipt and mapped
  Message together. The router adapter decodes each envelope once.
- Provider-owned `createCommitSource`, `renderError` and `onError`. Full Causes
  include setup failures, source failures, terminal Store crashes, and cleanup
  defects. Source failures recover on a valid notification without replaying
  successful tokens; terminal Store crashes remain until a fresh healthy
  activation. `onError` returns an `Effect<void, unknown>` and supports
  asynchronous observers. Live observer fibers end when the Provider stops.
  Cleanup reporting after stop has a five-second cooperative deadline, and cleanup
  defects are logged even if the observer fails, is interrupted, or times out.
- Option-returning root/child `useOptionalModel` and `useOptionalDispatch`, plus
  root `useOptionalCommit`. Optional projections construct retained snapshots
  only after presence; overlapping store activations share leases.

- Optional `Provider commitSource` applies initial Messages and connects later
  deliveries, preserving Commands and delivery records.
- `Loader.Load` from `fromQuery` for Loader-shaped settlement payloads.
- `defineSubmodel<Model, Message>()`, child Providers, selectors, dispatch, and
  root/child projections. Optional projections track presence and keep departing
  snapshots; equal selections skip source-driven renders.
- Synchronous `store.commit` and `useCommit` returning `Result<void, CommitError>`;
  lazy `Store.commit(store, message)` returning `Effect<void, CommitError>`.
  FIFO delivery, asynchronous Commands, and no enqueueing on rejection.
- Router-independent CommitSource types and `CommitSourceError`. Scoped
  connections keep successful tokens and full setup/cleanup Causes.
- `Loader.settleQueryIf` applies external outcomes to Foldkit Queries with a
  freshness policy and returns service-free cancellation Commands.
- `Store.takeWhen`, `Store.Disposed`, and the API Cache (Query) example.

### Changed

- Provider sessions own resource scopes, asynchronous observers, recovery, and
  stale-result suppression. React observes their stable failure snapshots.
- Concurrent and repeated disposal shares the original cleanup result, including
  defects. Final activation leases forward their closing Exit to resources.
- Derived resource keys encode through typed Results. Custom key exceptions stay
  defects. Root and child projections share one snapshot cache implementation.
- Add Effect-native `Store.make`, which allocates in the caller's Scope; retain
  `Store.boot` for synchronous hosts. `Store.dispose` returns `Effect<void>` and
  resolves once resources are released. Allocate PubSub and cached services within
  construction; build the browser scheduler Context directly.
- Reconciliation and `Loader.decode` return `Result`. The notification boundary
  captures snapshot and commit defects without squashing their Causes.
  `run-sync.ts` is gone.
- Concurrent activation leases share a store and subscription; scoped disposal
  releases resources even when a disposal listener throws. Resource finalizers
  retain the owning Scope's Exit.
- Query settlement uses typed keyed/plain inputs and preserves Foldkit completion
  identity. Remove transparent Query aliases and the mapping implementation cast.

- Foldkit uses the sibling checkout on `feat/query-httpapi`; Effect and
  `@effect/vitest` use `4.0.0`.
- Query and HTTP API endpoint derivation are supplied by
  `foldkit/experimental/query`. Remove the local Query implementation, root
  Query namespace, and `react-foldkit/query` export.
- Root/child selectors share React's external-store helper. Child Providers take
  projections; missing context raises `SubmodelProviderError`. The root owns state and effects.

### Breaking changes

- Structural `Loader` implementations no longer expose `toMessage`. Message
  mappings run through `decodeDelivery`, which returns the mapped Message and its
  validated receipt while preserving the Loader's name, data Codec, key, and load
  function.
- `Loader.decode` returns `Result<Message, SchemaError>`; custom CommitSource
  snapshots return `Result<ReadonlyArray<CommitEntry<Message>>, E>`. A schema or
  resource-key mismatch is typed data; a thrown callback stays a defect.
- `TanStackSource.make` returns `Result<CommitSource<Message, SchemaError>, RegistryError>`.
  Pass its result through Provider `createCommitSource`.
- Provider captures source and init at initialization. Source prop changes are
  ignored; remount to replace them. `SourceChanged` is removed. Boundary failures
  render/report their Cause instead of escaping React or router notifications.
- `Loader.fromQuery` accepts `key` only for keyed Queries. A plain Query has no
  arguments, so its resource identity is always `singleton`.

- Loader envelope `_tag` is `react-foldkit/Loader` (was `react-foldkit/CommitSource`).
- `defineApplication` no longer returns `useCommitSource`. Use Provider `commitSource`.
- `TanStackSource.make` accepts only piped Declarations (no `[declaration, map]` tuples).
- `Loader.fromQuery(query)` derives serialization from the Query Model and
  defaults delivery identity to Fetch.name and canonical encoded arguments
  (`singleton` for plain Queries). Options accept only optional name and key
  overrides; key callbacks receive decoded args. Keyed payloads use
  `{ args, result }`, allowing any Query argument name; plain payloads remain
  `{ result }`. Use `Loader.settleQueryIf` in
  application update and map its cancellation Commands to parent Messages.
- `ReactFoldkit.make` becomes `defineApplication`, also exported from
  `react-foldkit/react`.
- `defineApplication` takes flat `Store.Config` plus a Model Codec. Provider creates
  the store from init; `store`/`fromLive` are removed. `NoInfer` pins Layer services
  to update's requirements.
- Import Query from `foldkit/experimental/query`. Plain Queries use `init()`;
  interruptible Queries use `init(instanceId)`. Lifts use `parentField`.
  Use keyed `retainOnly` in update to prune inactive entries.
- `Update.Return` is `{ model, commands?, outMessage? }`; omit empty Commands.
  Remove `Command.none`.
- Declare Messages with `defineMessageUnion`; remove `m`.
- Rename `evo`/`makeConstrainedEvo` to `modifyFields`/`makeModifyFieldsFor`.
  Use Foldkit's helpers for Model transitions and child writes.
- Use `Update.foldChild` for nested updates; remove `react-foldkit/submodel`.
- Interruptible outcomes use `Interruptible.Outcome.Interrupted()`/`NotFound()`.
- Require Node `>=20.19.0`.

## 0.1.0

First release:

- React Provider, selectors, and dispatch with Foldkit boot ordering, drain budgets,
  crash handling, interruption, and Scope teardown.
- Foldkit Command, Message, Update, Struct, Schema, AsyncData, and Subscription exports.
- Recommended/strict ESLint presets and Todo/Stopwatch examples.

Import through `react-foldkit/*`. Foldkit is a regular dependency;
see [third-party notices](./THIRD-PARTY-NOTICES.md).
