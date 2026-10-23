# How React Foldkit works

React Foldkit runs a Foldkit program behind React views. One application owns the Model and side effects. Child views reuse that ownership, so a component's mount state does not become application state.

## Messages and effects

`update(model, message)` returns `{ model, commands?, outMessage? }`. The Store applies the Model before running returned Commands. Command results and Subscription Streams deliver more Messages to the same queue.

Dispatch schedules FIFO delivery. `Store.commit` delivers synchronously through the submitted Message and returns before Commands finish. Commit has no rollback. Reentry or an inactive, disposed, or crashed Store produces a `CommitError` whose `reason` is `Reentrant`, `Inactive`, `Disposed`, or `Crashed`; handle one with `Effect.catchReason`. Commit is a Store API; React views use `useSend` or `useDispatch`. `useSend` builds Messages with the constructors of the Message union passed to `Application.define` or `Submodel.define`, then dispatches them.

A Store crash stops delivery and releases live work. `takeWhen` fails with `Crashed` or `Disposed` when the Store is terminal. Observers cannot change the delivery result by throwing.

## Ownership and React

`Store.make` belongs to the caller's Effect Scope. Its `RuntimeProgram` contract can use ambient services. It describes runtime behavior without the Schemas and optional `init` of `Program.Program`. `Store.boot` and React applications use a `Config` whose `resources` Layer is closed when services are required. Static services are acquired lazily and released after live work stops. Programs can also declare Foldkit `managedResources`, whose requirements come from the Model. Each activation owns their live values. Registered resource services require no additional Layer; the host supplies the remaining services.

An application Provider captures `init` during initialization, from its `init` prop or, without one, from the application config. Remount it to replace it, or send later changes to update with `useInbound`. Initialization must be pure because React can repeat or abandon render. Client activation starts Managed Resource watchers, Commands, and Subscriptions. Deactivation stops Commands and Subscriptions, releases managed resources, and then releases static services while retaining the Model for reactivation. Messages dispatched while the Provider is inactive wait for the next activation.

`retainInactive` keeps the Store, its Layer, and its live work running for a window after deactivation, so a quick hide and show interrupts nothing. Once deactivation stops a Store's live work, the next activation restarts it from the retained Model. Completed init Commands do not repeat on replacement, and interrupted init Commands restart. Interrupted update Commands restart when `restartInterrupted` selects them. The rest reach `onReactivate`, which turns them into a Message. The initial server snapshot stays available for hydration.

Outside production builds, the Provider checks its initial Model against the Model Schema and freezes every published Model, so accidental mutation throws where it happens.

`crash.view` renders failures with the Model and triggering Message when they are known, and can restart the Provider from `init`. `crash.report` observes client failures as an Effect. Report failures are logged separately. A setup or cleanup failure can recover after a healthy reactivation. A Store crash remains terminal for that Store, though a new healthy activation can replace it.

## Child Models

`Submodel.define` creates child Providers and hooks from the child Model Schema and Message union. A child Provider takes the parent hooks and a lift, the parent hooks and an `optionalLift` for a child stored in an `Option`, or a source derived with `useSubmodel`. With `optionalLift`, the Provider renders its children while the child is present and `fallback` while it is absent. `Submodel.lift` describes a child stored in one parent field once: it reads and writes the field, wraps child Messages, and folds the child update with Foldkit's `Update.foldChild`. For any other read, pass an object with `read` and `toParentMessage`. Declare lifts outside render; the `no-inline-submodel-lift` lint rule reports lifts built during render.

`Program.make` groups the Model Schema, Message union, `init`, update, Subscriptions, and Managed Resources of an application or child without React. `Application.define` takes an application Program and, as a separate second argument, the React options and the `resources` that supply its services. `Store.make` and `Store.boot` also accept an application Program, and a child Program goes to `Submodel.define`. Programs register Model-driven resources through `managedResources` and leave static `resources` to the host that runs them. See [Managed Resources](managedResources.md) for declarations, composition, and lifecycle behavior.

A child Provider consumes a projected source. It creates no Store and runs no side effects of its own. Unmounting a child does not cancel its Commands. Handle cancellation and stale child identity in the parent update.

`useModel()` compares whole snapshots with `Object.is`. Selectors default to `Equal.equals`, which compares plain objects and arrays structurally on every change, and accept a custom equality function. Required hooks need their matching Provider. Optional hooks return `Option`. Optional child sources retain their last snapshot while the child is absent.

## Async data

Load server data with Foldkit Query from `foldkit/experimental/query`. Its Model tracks data, failure, and pending state. Its lift returns Commands to fetch or revalidate data. Reset clears cached data and ignores late responses. It does not abort requests. Send a Message when a view needs data, then call the Query lift from update.

## Implementation map

| Module            | Responsibility                                                                |
| ----------------- | ----------------------------------------------------------------------------- |
| `src/store`       | Message queue, Commands, Subscriptions, crash, and disposal                   |
| `src/application` | Application bindings, activation, selectors, and failure reporting            |
| `src/modelSource` | Shared snapshot, subscription, and dispatch contracts                         |
| `src/program`     | Programs shared by React, Stores, and tests                                   |
| `src/submodel`    | Child bindings and Model sources                                              |
| `src/internal`    | Init Command tracking, Model freezing, and Foldkit interruption compatibility |

Public barrels define the exports. Applications import Foldkit vocabulary from `foldkit`, a peer dependency, so both packages share one copy. See the [API reference](reference.md) for the public contracts.
