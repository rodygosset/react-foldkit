# Changelog

## Unreleased

### Added

- Optional `Provider commitSource` applies initial Messages and connects later
  deliveries, preserving Commands and delivery records.
- Public `Query.AsyncData` (Foldkit AsyncData Schema factory) for slot codecs.
- `Loader.Load` from `fromQuery`, plus `Loader.settleIfLoad` for Loader-shaped settlement.
- `defineSubmodel<Model, Message>()`, child Providers, selectors, dispatch, and
  root/child projections. Optional projections track presence and keep departing
  snapshots; equal selections skip source-driven renders.
- Synchronous `store.commit` and `useCommit` returning `Result<void, CommitError>`;
  lazy `Store.commit(store, message)` returning `Effect<void, CommitError>`.
  FIFO delivery, asynchronous Commands, and no enqueueing on rejection.
- Router-independent CommitSource types and `CommitSourceError`. Scoped
  connections keep successful tokens and full setup/cleanup Causes.
- `query.settle(model, result)`, keyed/lifted forms, and data-last steps. Settlement
  keeps good data on failure, invalidates old Fetches, and can interrupt pending
  work without fetch services. Only Success and Failure settle the Model.
- `Query.run` and keyed `run(args)` loading Effects. `Query.HttpApi.Service.query`
  derives endpoint Queries and serializable HTTP errors.
- `Store.takeWhen`, `Store.Disposed`, and the API Cache (Query) example.

### Changed

- Foldkit `0.164.0`, Effect `4.0.0-rc.117`, and Vitest 5.
- Foldkit Query lifecycles: instance/request IDs, stale completion rejection,
  direct policies, full-set watch, and opt-in interruption.
- Query interrupt keys include `requestId`; delayed cancellation cannot interrupt
  a newer Fetch. Add `CancelIntent.Settle`.
- Root/child selectors share React's external-store helper. Child Providers take
  projections; missing context raises `SubmodelProviderError`. The root owns state and effects.

### Breaking changes

- Loader envelope `_tag` is `react-foldkit/Loader` (was `react-foldkit/CommitSource`).
- `defineApplication` no longer returns `useCommitSource`. Use Provider `commitSource`.
- `TanStackSource.make` accepts only piped Declarations (no `[declaration, map]` tuples).
- Prefer `query.AsyncData` / `Loader.Load` over digging into `Model.fields`.
- `settleIfLoad` is on `react-foldkit/loader`, not on Query.
- `settleIfLoad` keeps one overloaded API for keyed and unkeyed targets. Keyed
  dispatch brands keyed `settleIf` at Query/lift creation instead of counting
  load keys.
- `ReactFoldkit.make` becomes `defineApplication`, also exported from
  `react-foldkit/react`.
- `defineApplication` takes flat `Store.Config` plus a Model Codec. Provider creates
  the store from init; `store`/`fromLive` are removed. `NoInfer` pins Layer services
  to update's requirements.
- Query init requires an instance ID; read returns wrapped AsyncData. Parent
  `Got*` cases carry `{ message: query.Message }`; lift uses `toParentMessage`.
- Direct `Fetch.Interrupt` calls require `requestId`.
- Remove `Query.ensure` and `lift.ensure`. HttpApi endpoint derivation returns
  `Query.Query` or `Query.KeyedQuery`.
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
