# How React Foldkit works

React Foldkit runs a Foldkit program behind React views. One application owns the Model and every side effect. Child views share that owner, so mounting or unmounting a component never creates or loses application state.

## Messages go through one queue

`update(model, message)` returns `{ model, commands?, outMessage? }`. The Store saves the new Model first, then starts the returned Commands. When a Command finishes, or a Subscription's Stream emits, the result is another Message on the same queue.

Messages are delivered in the order they were sent. There are two ways to send one:

| API | Who uses it | What it does |
| --- | --- | --- |
| `useSend` or `useDispatch` | React views | Queues the Message. `useSend` builds it with the constructors of the Message union passed to `Application.define` or `Submodel.define`. |
| `Store.commit` | Code outside React | Delivers synchronously up to and including this Message, then returns before its Commands finish. There is no rollback. |

`commit` fails with a `CommitError` when it can't deliver. Its `reason` says why:

| Reason | When |
| --- | --- |
| `Reentrant` | Called while the Store is already delivering a Message |
| `Inactive` | React has deactivated the Provider that owns the Store |
| `Disposed` | The Store was disposed |
| `Crashed` | The Store crashed. The reason carries the crash's Cause. |

Handle one reason with `Effect.catchReason`.

A crash stops delivery and releases the Store's live work. After that, `takeWhen` fails with `Crashed` or `Disposed`. An observer that throws can't change whether a Message was delivered.

## The Store owns services and resources

`Store.make` belongs to the caller's Effect Scope. Its `RuntimeProgram` can use services from the caller's context. `RuntimeProgram` describes runtime behavior only. It has none of the Schemas or the optional `init` that `Program.Program` has.

`Store.boot` and React applications take a `Config` with a `resources` Layer. The Layer must provide every service the Program needs. The Store builds those services the first time live work needs them, and releases them after live work stops.

A Program can also declare Foldkit `managedResources`, which exist only while the Model asks for them, such as a socket that is open while a field is set. Each activation owns its own live values. A registered resource supplies its own service, so it needs no Layer. The host supplies every other service. [Managed Resources](managedResources.md) covers declaring, composing, and running them.

## A Provider ties the Store to React

### Starting

An application Provider reads `init` once, when it first renders. It uses its `init` prop or, without one, the Program's `init`. To use a different `init`, remount the Provider. To pass later changes to `update`, use `useInbound`. `init` must be pure, because React can render a component twice or throw a render away.

In development, the Provider checks the starting Model against the `Model` Schema. It also freezes every Model it publishes, so code that mutates a Model throws where the mutation happens.

### Activating and deactivating

When the Provider activates in the browser, it starts the Managed Resource watchers, the Commands, and the Subscriptions. When it deactivates, it:

1. stops Commands and Subscriptions,
2. releases managed resources,
3. releases the other services,
4. and keeps the Model for the next activation.

Messages sent while the Provider is inactive wait for the next activation.

### Coming back

`retainInactive` keeps the Store, its Layer, and its live work running for a while after deactivation. A quick hide and show interrupts nothing.

Once deactivation has stopped the live work, the next activation restarts it from the kept Model:

- Init Commands that finished don't run again. Interrupted init Commands start again.
- Interrupted update Commands start again when `restartInterrupted` selects them. `onReactivate` turns the others into a Message.
- The first server snapshot stays available for hydration.

### Hot reload

With the `preserveModel()` Vite plugin, editing the module that calls `Application.define` keeps the Model. `define` returns the same Provider as before the reload, so React keeps it mounted. The Provider restarts from the new Program and keeps the live Model, unless the Model no longer matches the new `Model` Schema. In that case it starts from `init`.

### Handling crashes

`crash.view` renders a failure with the Model and the Message that caused it, when they are known. It can restart the Provider from `init`. `crash.report` receives client failures as an Effect, and any failure inside the report is logged separately.

A failure during setup or cleanup can recover after a healthy reactivation. A Store crash is final for that Store, but a new healthy activation can replace it.

## Child features share the parent's Store

`Submodel.define` creates a child Provider and hooks from the child's Model Schema and Message union. The child Provider gets its part of the parent Model in one of three ways:

| Child Provider props | When to use it |
| --- | --- |
| `from` and `lift` | The child is always in one parent field. |
| `from` and `optionalLift` | The child is stored in an `Option`. The Provider renders its children while the child exists, and `fallback` while it doesn't. |
| `source` | You built the source yourself with `useSubmodel`. |

`Submodel.lift` describes a child in one parent field. It reads and writes the field, wraps child Messages, and folds the child's `update` with Foldkit's `Update.foldChild`. For any other shape, pass an object with `read` and `toParentMessage`. Declare lifts outside render. The `no-inline-submodel-lift` lint rule reports lifts built during render.

A child Provider reads a slice of the parent. It creates no Store and runs no side effects. Unmounting a child doesn't cancel its Commands, so handle cancellation and stale children in the parent's `update`.

## Programs keep logic outside React

`Program.make` groups an application's or a child's Model Schema, Message union, `init`, `update`, Subscriptions, and Managed Resources, with no React import.

- `Application.define` takes an application Program, plus a second argument with the React options and the `resources` that supply its services.
- `Store.make` and `Store.boot` also take an application Program.
- `Submodel.define` takes a child Program.

A Program registers resources that follow the Model through `managedResources`. It leaves other services to whatever runs it.

## Reading the Model

| Hook | Compares | Notes |
| --- | --- | --- |
| `useModel()` | Whole snapshots, with `Object.is` | |
| `useModel(selector)` | Selected values, with `Equal.equals` by default | `Equal.equals` compares plain objects and arrays by content on every change. Pass your own equality function for large or already-stable values. |

Required hooks need their Provider. Optional hooks return an `Option`. An optional child source keeps its last snapshot while the child is absent.

## Load server data with Query

Load server data with Foldkit Query, from `foldkit/experimental/query`. Its Model tracks the data, the failure, and whether a request is pending. Its lift returns Commands that fetch or refresh the data.

Send a Message when a view needs data, then call the Query lift from `update`. Resetting a Query clears its data and ignores late responses. It doesn't cancel requests already sent.

## Where the code lives

| Folder | What it holds |
| --- | --- |
| `src/store` | The Message queue, Commands, Subscriptions, crashes, and disposal |
| `src/application` | The application bindings, activation, selectors, hot reload, and failure reporting |
| `src/modelSource` | The shared contracts for snapshots, subscriptions, and dispatch |
| `src/program` | Programs shared by React, Stores, and tests |
| `src/submodel` | Child bindings and Model sources |
| `src/internal` | Init Command tracking, Model freezing, and compatibility with Foldkit's interrupts |

The public barrels define the exports. Apps import Foldkit's own pieces from `foldkit`, a peer dependency, so the app and React Foldkit share one copy. The [API reference](reference.md) lists every public contract.
