# Changelog

## Unreleased

### Added

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

- Foldkit uses the sibling checkout on `feat/query-httpapi`; Effect and
  `@effect/vitest` use `4.0.0`.
- Query and HTTP API endpoint derivation are supplied by
  `foldkit/experimental/query`. Remove the local Query implementation, root
  Query namespace, and `react-foldkit/query` export.
- Root/child selectors share React's external-store helper. Child Providers take
  projections; missing context raises `SubmodelProviderError`. The root owns state and effects.

### Breaking changes

- Loader envelope `_tag` is `react-foldkit/Loader` (was `react-foldkit/CommitSource`).
- `defineApplication` no longer returns `useCommitSource`. Use Provider `commitSource`.
- `TanStackSource.make` accepts only piped Declarations (no `[declaration, map]` tuples).
- `Loader.fromQuery` requires explicit name, serialization Schemas, and resource
  key. Keyed Queries also require args Schemas. Use `Loader.settleQueryIf` in
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
