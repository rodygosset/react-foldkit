# How React Foldkit works

React Foldkit runs a Foldkit program behind React views. One application owns the Model and side effects. Child views reuse that ownership, so a component's mount state does not become application state.

## Messages and effects

`update(model, message)` returns `{ model, commands?, outMessage? }`. The Store applies the Model before running returned Commands. Command results and Subscription Streams deliver more Messages to the same queue.

Dispatch schedules FIFO delivery. Commit delivers synchronously through the submitted Message and returns before Commands finish. Commit has no rollback. Reentry or an inactive, disposed, or crashed Store produces a `CommitError`.

A Store crash stops delivery and releases live work. `takeWhen` fails with `Crashed` or `Disposed` when the Store is terminal. Observers cannot change the delivery result by throwing.

## Ownership and React

`Store.make` belongs to the caller's Effect Scope. Its `Program` can use ambient services. `Store.boot` and React applications use a `Config` with a closed Layer when services are required. Services are acquired lazily and released after live work stops.

An application Provider captures `init` and its commit source during initialization. Remount it to replace either. Initialization and source reads must be pure because React can repeat or abandon render. Client activation starts Commands and Subscriptions. Deactivation stops live work while retaining the Model for reactivation.

Completed init Commands do not repeat on reactivation. Interrupted ones can restart. Use `onReactivate` to reconcile pending application work through a Message. The initial server snapshot stays available for hydration.

`renderError` receives failure Causes. `onError` observes client failures as an Effect. Observer failures are logged separately. A source failure can recover after a valid snapshot. A Store crash remains terminal for that Store, though a new healthy activation can replace it.

## Child Models

`Submodel.define` creates child Providers and hooks. `Submodel.lift` describes how to read the child Model and wrap its Messages. The parent uses `Update.foldChild` or a Query lift to delegate updates and map Commands.

A child Provider consumes a projected source. It creates no Store and runs no side effects of its own. Unmounting a child does not cancel its Commands. Handle cancellation and stale child identity in the parent update.

`useModel()` compares whole snapshots with `Object.is`. Selectors default to `Equal.equals` and accept a custom equality function. Required hooks need their matching Provider. Optional hooks return `Option`. Optional child sources retain their last snapshot while the child is absent.

## External data

A Loader encodes data into an envelope and decodes accepted envelopes into Messages. `Loader.fromQuery` derives its payload from a Query. Keyed payloads contain `{ args, result }`. Plain payloads contain `{ result }`.

A commit source exposes synchronous snapshots and a subscription. The Provider folds its initial snapshot during render, then commits changed entries after activation. Acquire resources in `subscribe` and release them in its cleanup.

Each source key remembers its last successfully delivered version using `Object.is`. Reconnection preserves that record. Removing a key forgets it. Duplicate keys and notifications during reconciliation fail the source contract.

Delivery versions prevent repeated delivery. They do not establish data freshness. `Loader.settleQueryIf` applies the application's freshness policy, invalidates older fetch generations, and returns cancellation Commands. It does not start a fetch.

`TanStack.make` adapts successful route matches into a commit source. A registry maps declaration names to decoders. Duplicate names fail construction. Invalid recognized envelopes fail snapshot reads. Unrelated loader data is ignored.

## Implementation map

| Module             | Responsibility                                                     |
| ------------------ | ------------------------------------------------------------------ |
| `src/store`        | Message queue, Commands, Subscriptions, crash, and disposal        |
| `src/react`        | Application bindings, activation, selectors, and failure reporting |
| `src/modelSource` | Shared snapshot, subscription, and dispatch contracts |
| `src/submodel`     | Child bindings and Model sources                                   |
| `src/commitSource` | Snapshot reconciliation and delivery records                       |
| `src/loader`       | Envelopes, codecs, resource keys, and Query settlement             |
| `src/tanstack.ts`  | Router adapter                                                     |
| `src/internal`     | Init Command tracking and Foldkit interruption compatibility       |

Public barrels define the exports. Foldkit reexports keep their original identity. See the [API reference](reference.md) for the public contracts.
