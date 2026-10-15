# Public API reference

Generated from the public exports. See the [counter tutorial](examples.md) for usage and [runtime architecture](architecture.md) for ownership. Regenerate with `bun run --filter=react-foldkit docs:generate` from the repository root.

- [react-foldkit](#react-foldkit)
- [react-foldkit/react](#react-foldkitreact)
- [react-foldkit/store](#react-foldkitstore)
- [react-foldkit/submodel](#react-foldkitsubmodel)
- [react-foldkit/eslint](#react-foldkiteslint)
- [react-foldkit/commitSource](#react-foldkitcommitSource)
- [react-foldkit/loader](#react-foldkitloader)
- [react-foldkit/tanstack](#react-foldkittanstack)
- [react-foldkit/modelSource](#react-foldkitmodelSource)

## react-foldkit

### CommitSource

External Message snapshots and delivery identities for application Providers.

### Loader

Loader declarations, Query adapters, and envelope transport.

### ModelSource

Model snapshots, subscriptions, and dispatch contracts shared by React bindings.

### ReactFoldkit

Application Providers, Model hooks, and child lifts.

### Store

Scoped Model ownership, Message delivery, and lifecycle errors.

### Submodel

Child Model Providers, hooks, and lifts.

## react-foldkit/react

### Application

The Provider and hooks returned by `defineApplication` for a Foldkit application.
Render its Provider above the views that use its hooks. Each mounted Provider owns an
independent Model and the Commands and Subscriptions that update it.

- `Provider` Provides application state to its children and owns Commands and Subscriptions while active.
  Captures `init` and the commit source on initialization. Remount to replace either.

  ```ts
  <E = never, FactoryError = never>(props: ProviderProps<Model, Message, R, E, FactoryError>) => React.ReactNode
  ```

- `useModel` Subscribes the view to the Model or a selected value. Pass a selector to read only the
  value the view needs. Whole Models use `Object.is`. Selections use `Equal.equals`, which
  compares plain objects and arrays structurally on every Model change; pass `isEqual` when
  a selection is large or already reference-stable. Throws outside the matching Provider.

  ```ts
  { (): Model; <Selected>(selector: (model: Model) => Selected, isEqual?: ((a: Selected, b: Selected) => boolean) | undefined): Selected; }
  ```

- `useDispatch` Returns a function that sends Messages to the owning application. It does not confirm
  delivery or wait for Commands. Throws outside the matching Provider.

  ```ts
  () => (message: Message) => void
  ```

- `useOptionalModel` Reads `Some(Model)` inside the matching Provider and `None` outside it.

  ```ts
  () => Option.Option<Model>
  ```

- `useOptionalDispatch` Returns `Some(dispatch)` inside the matching Provider and `None` outside it.

  ```ts
  () => Option.Option<(message: Message) => void>
  ```

- `useInbound` Sends a Message whenever an external value changes, such as a route parameter or prop.
  The first value is not sent; include it in `init`. Values are compared with `isEqual`,
  which defaults to `Equal.equals`. Throws outside the matching Provider.

  ```ts
  <A>(value: A, toMessage: (value: A) => Message, isEqual?: ((previous: A, next: A) => boolean) | undefined) => void
  ```

- `useSubmodel` Creates a source for a child Submodel from this Provider's Model. The lift reads the child
  Model and wraps its Messages for the parent. The child shares the parent Store and
  subscription. Declare the lift outside render, or memoize it: a new `read` or
  `toParentMessage` creates a new source. Throws outside the matching Provider.

  ```ts
  <ChildModel, ChildMessage>(projection: Lift<Model, Message, ChildModel, ChildMessage>) => ModelSource<ChildModel, ChildMessage>
  ```

- `useOptionalSubmodel` Returns `None` while the child Model is absent. A previously created source retains its
  last Model while absent and resumes when the child returns. Throws outside the matching
  parent Provider.

  ```ts
  <ChildModel, ChildMessage>(projection: OptionalLift<Model, Message, ChildModel, ChildMessage>) => Option.Option<ModelSource<ChildModel, ChildMessage>>
  ```

### CommitEntry

One delivery in a commit-source snapshot. Sources use its key and version to identify an
external Message so the Provider can avoid repeating its delivery.

The key identifies an entry within its source. The version identifies the delivery,
independently of the Message object's identity.

- `key` Identifies an entry within the source. Each snapshot must contain at most one entry for a
  key.

  ```ts
  string
  ```

- `version` Compared with the last successfully delivered version for this key using `Object.is`.
  Change it to request another delivery.

  ```ts
  string | number
  ```

- `message`

  ```ts
  Message
  ```

### CommitSource

Adapter between an external data source and an application Provider. Use it to turn
external values into Messages during initialization and live updates.

**Details**

The Provider folds the initial snapshot during render, then commits changed entries after
activation. Successfully delivered versions remain recorded across reconnects. Removing a
key from a reconciled snapshot forgets its recorded version.

**Gotchas**

Reads and construction must not acquire resources. Acquire live resources in `subscribe` and
release them in its cleanup. Notifications during reconciliation must not recursively
publish another snapshot.

- `getSnapshot` Reads the current snapshot synchronously. Returns source failures as `Result` data and
  performs no side effects.

  ```ts
  () => Result.Result<ReadonlyArray<CommitEntry<Message>>, E>
  ```

- `subscribe` Registers publication notifications and returns cleanup. After a notification,
  `getSnapshot` must expose the published snapshot.

  ```ts
  (notify: () => void) => () => void
  ```

### CommitSourceError

Failure caused by duplicate snapshot keys or a source notification during reconciliation.
Handle one reason with `Effect.catchReason("CommitSourceError", "DuplicateKey", ...)`.

### Config

The Model Schema and Program used to create a React application with `defineApplication`.
Define a pure update function here and return Commands for side effects. Provide services
needed by Commands or Subscriptions through `resources`.

The Layer must require no additional services and have no typed failures. The Model Schema
supplies the TypeScript type. Outside production builds, the Provider also checks its initial
Model against the Schema and freezes published Models.

- `update` Applies a Message to the Model without running side effects. Return Commands for work that
  runs after the transition.

  ```ts
  ((model: Schema.Schema.Type<ModelSchema>, message: Message) => Readonly<{ model: Schema.Schema.Type<ModelSchema>; commands?: Update.Commands<Message, R> | undefined; outMessage?: never; }>) | ((model: Schema.Schema.Type<ModelSchema>, message: Message) => Readonly<{ model: Schema.Schema.Type<ModelSchema>; commands?: Update.Commands<Message, R> | undefined; outMessage?: never; }>)
  ```

- `subscriptions` Declares Streams whose dependencies are derived from the Model. Changed dependencies
  restart their Streams.

  ```ts
  Readonly<Record<string, import("foldkit/subscription").Subscription<Schema.Schema.Type<ModelSchema>, Message, any, R>>> | Readonly<Record<string, import("foldkit/subscription").Subscription<Schema.Schema.Type<ModelSchema>, Message, any, R>>> | undefined
  ```

- `onCrash` Called once on terminal failure, with the original Cause and a Message when one triggered
  the failure. Runs before `subscribeCrash` listeners. Observer defects are logged.

  ```ts
  ((cause: Cause.Cause<unknown>, triggeringMessage: Option.Option<Message>) => void) | undefined
  ```

- `resources` Supplies all required services. Live work finishes before the Layer releases its
  resources.

  ```ts
  import("effect/Layer").Layer<never, never, never> | import("effect/Layer").Layer<NoInfer<R>, never, never> | undefined
  ```

- `onReactivate` Creates a Message when the Provider reactivates with a replacement Store. Use it to retry
  interrupted work or clear pending state. It is not called on the initial activation or when
  `retainInactive` kept the previous Store running.

  ```ts
  ((context: ReactStore.ReactivationContext<Schema.Schema.Type<ModelSchema>, Message, R>) => Message) | undefined
  ```

- `retainInactive` Keeps the Store, its Layer, Commands, and Subscriptions running for this long after the
  last activation ends. Reactivating within the window resumes the same Store without
  interrupting anything. Defaults to zero, which disposes the Store on deactivation.
  
  Work started before an unmount can still finish during the window, so keep it short when
  Commands perform writes or navigation.

  ```ts
  import("effect/Duration").Input | undefined
  ```

- `restartInterrupted` Starts Commands interrupted by deactivation again when a replacement Store activates. Pass
  `true` for all of them or a predicate to choose. Restart only idempotent work, such as
  Query fetches: an interrupted write may already have reached its server.

  ```ts
  boolean | ((command: import("foldkit/command").Command<Message, never, R>) => boolean) | undefined
  ```

- `freezeModel` Freezes every Model the Provider publishes so accidental mutation throws where it happens.
  Plain objects and arrays are frozen; Effect values and class instances are not. Defaults to
  `true` outside production builds.

  ```ts
  boolean | undefined
  ```

- `Model` Supplies the Model type and checks the initial Model when `validateInit` is on.

  ```ts
  ModelSchema
  ```

- `crash` Default failure view and reporting for every Provider of this application.

  ```ts
  CrashConfig<Schema.Schema.Type<ModelSchema>, Message> | undefined
  ```

- `validateInit` Checks the initial Model, after the commit-source snapshot, against `Model`. A mismatch
  fails the Provider with a `SchemaError`. Defaults to `true` outside production builds.

  ```ts
  boolean | undefined
  ```

### CrashConfig

How an application shows and reports failures. Mirrors Foldkit's crash configuration.
Set it on `defineApplication`, and override either callback on a Provider.

- `view` Renders in place of the Provider's children. Call `restart` to remount the Provider with
  a fresh Store from `init`. The default view shows an Error's message.

  ```ts
  ((context: CrashContext<Model, Message> & { readonly restart: () => void; }) => React.ReactNode) | undefined
  ```

- `report` Observes client failures asynchronously, such as by sending them to a logging service.
  Report failures are logged and never replace the view. Reports are interrupted on
  timeout or Provider shutdown.

  ```ts
  ((context: CrashContext<Model, Message>) => Effect.Effect<void, unknown>) | undefined
  ```

### CrashContext

What the Provider knows about a failure it shows or reports.

- `cause` The full failure, with its annotations preserved.

  ```ts
  Cause.Cause<unknown>
  ```

- `model` The Model when the failure happened. `None` when the Provider failed before it had a Model,
  such as a commit source that could not be created.

  ```ts
  Option.Option<Model>
  ```

- `message` The Message whose update or Command crashed the Store. `None` for other failures, such as
  Subscriptions, init Commands, or commit sources.

  ```ts
  Option.Option<Message>
  ```

### ModelHooks

The hooks shared by applications and Submodels.
Use them inside the matching Provider to read its Model, send Messages, or give a child
Submodel access to part of that Model.

- `useModel` Subscribes the view to the Model or a selected value. Pass a selector to read only the
  value the view needs. Whole Models use `Object.is`. Selections use `Equal.equals`, which
  compares plain objects and arrays structurally on every Model change; pass `isEqual` when
  a selection is large or already reference-stable. Throws outside the matching Provider.

  ```ts
  { (): Model; <Selected>(selector: (model: Model) => Selected, isEqual?: (a: Selected, b: Selected) => boolean): Selected; }
  ```

- `useDispatch` Returns a function that sends Messages to the owning application. It does not confirm
  delivery or wait for Commands. Throws outside the matching Provider.

  ```ts
  () => (message: Message) => void
  ```

- `useOptionalModel` Reads `Some(Model)` inside the matching Provider and `None` outside it.

  ```ts
  () => Option.Option<Model>
  ```

- `useOptionalDispatch` Returns `Some(dispatch)` inside the matching Provider and `None` outside it.

  ```ts
  () => Option.Option<(message: Message) => void>
  ```

- `useInbound` Sends a Message whenever an external value changes, such as a route parameter or prop.
  The first value is not sent; include it in `init`. Values are compared with `isEqual`,
  which defaults to `Equal.equals`. Throws outside the matching Provider.

  ```ts
  <A>(value: A, toMessage: (value: A) => Message, isEqual?: (previous: A, next: A) => boolean) => void
  ```

- `useSubmodel` Creates a source for a child Submodel from this Provider's Model. The lift reads the child
  Model and wraps its Messages for the parent. The child shares the parent Store and
  subscription. Declare the lift outside render, or memoize it: a new `read` or
  `toParentMessage` creates a new source. Throws outside the matching Provider.

  ```ts
  <ChildModel, ChildMessage>(projection: Lift<Model, Message, ChildModel, ChildMessage>) => ModelSource<ChildModel, ChildMessage>
  ```

- `useOptionalSubmodel` Returns `None` while the child Model is absent. A previously created source retains its
  last Model while absent and resumes when the child returns. Throws outside the matching
  parent Provider.

  ```ts
  <ChildModel, ChildMessage>(projection: OptionalLift<Model, Message, ChildModel, ChildMessage>) => Option.Option<ModelSource<ChildModel, ChildMessage>>
  ```

### ProviderProps

Props for the application Provider that supplies the Model and Message handlers to its views.
`init` supplies the initial Model and Commands. A commit source can supply additional Messages,
and `crash` overrides how this Provider shows and reports failures.

The Provider captures `init` and its source on initialization. Changing those props later
does not replace them. Children and crash callbacks follow subsequent renders. Use
`useInbound` to send later prop changes to update.

- `init` Initial Model and Commands, or a function that creates them. The Provider calls a function
  once per initialization, including after a crash view's `restart`.

  ```ts
  Readonly<{ model: Model; commands?: Update.Commands<Message, R> | undefined; outMessage?: never; }> | (() => Update.Return<Model, Message, R>)
  ```

- `children`

  ```ts
  React.ReactNode
  ```

- `crash` Overrides the application's crash view or report for this Provider.

  ```ts
  CrashConfig<Model, Message> | undefined
  ```

- `commitSource` Source captured during Provider initialization. Mutually exclusive with
  `createCommitSource`.

  ```ts
  CommitConnection.CommitSource<Message, E> | undefined
  ```

- `createCommitSource` Constructs a source during render, including SSR. React may repeat or abandon the call.
  Keep construction pure and acquire resources in `subscribe`.

  ```ts
  (() => Result.Result<CommitConnection.CommitSource<Message, E>, FactoryError>) | undefined
  ```

### ReactivationContext

What the Provider knows when it replaces a Store that deactivation disposed.

- `model` The Model retained from the disposed Store.

  ```ts
  Model
  ```

- `interrupted` Commands returned by update that deactivation interrupted and `restartInterrupted` did not
  restart, in start order. Init Commands are excluded because they restart automatically.

  ```ts
  Update.Commands<Message, R>
  ```

### SourceOptions

Options for receiving Messages from external data, such as route loader results.
Pass a commit source directly or provide a factory that creates it during Provider initialization.

Choose either `commitSource` or `createCommitSource`. The Provider keeps that source for its
mounted lifetime. Remount it to use another source. Factory failures use the Provider's
crash view and reporting.

- `commitSource` Source captured during Provider initialization. Mutually exclusive with
  `createCommitSource`.

  ```ts
  CommitConnection.CommitSource<Message, E> | undefined
  ```

- `createCommitSource` Constructs a source during render, including SSR. React may repeat or abandon the call.
  Keep construction pure and acquire resources in `subscribe`.

  ```ts
  (() => Result.Result<CommitSource.CommitSource<Message, E>, FactoryError>) | undefined
  ```

### defineApplication

Creates a React Provider and hooks for a Foldkit application.
Define the application once, then render its Provider with an initial Model. Views read
state with `useModel` and send Messages with `useDispatch`.

**Details**

The Provider renders the initial Model and applies the initial commit-source snapshot during
render, including SSR. Commands and Subscriptions start when React activates the Provider.
Deactivation stops them and retains the Model for reactivation, unless `retainInactive`
keeps the Store running for a while.

Completed init Commands do not run again after reactivation. Interrupted init Commands
restart. Interrupted update Commands restart when `restartInterrupted` selects them, and the
rest reach `onReactivate`.

**Gotchas**

React may repeat or abandon initialization. Keep update and source construction pure.
Remount the Provider to replace `init` or its commit source, or use `useInbound` to send
changing values to update.

**Example** (Connecting a counter to React)

```tsx
import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import { defineApplication } from "react-foldkit/react"
import { modifyFields } from "foldkit/struct"
import type * as Update from "foldkit/update"

const Model = Schema.Struct({ count: Schema.Finite })
type Model = typeof Model.Type

const Message = defineMessageUnion({ ClickedIncrement: {} })
type Message = typeof Message.Type

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedIncrement: () => ({ model: modifyFields(model, { count: (count) => count + 1 }) }),
  })

const Application = defineApplication({ Model, update })

function View() {
  const count = Application.useModel((model) => model.count)
  const dispatch = Application.useDispatch()

  return <button onClick={() => dispatch(Message.ClickedIncrement())}>{count}</button>
}

export function App() {
  return (
    <Application.Provider init={{ model: { count: 0 } }}>
      <View />
    </Application.Provider>
  )
}
```

The button starts at `0`. Each click sends `ClickedIncrement` and updates the displayed count.

## react-foldkit/store

### CommitError

A Message delivery failure returned by `commit`.
`reason` is `Inactive`, `Reentrant`, `Disposed`, or `Crashed`; a `Crashed` reason carries the
original crash Cause. Handle one reason with `Effect.catchReason("CommitError", "Inactive", ...)`.

A failure does not undo Model changes already applied while processing Messages.

### Config

A Program with a Layer that provides the services its Commands and Subscriptions need.
Use this configuration with React or `boot`, where there is no surrounding Effect Context
to supply those services.

The Layer must require no additional services and have no typed failures. It is optional
when the Program requires no services. The Store builds it when live work first needs it.

- `update` Applies a Message to the Model without running side effects. Return Commands for work that
  runs after the transition.

  ```ts
  ((model: Model, message: Message) => Readonly<{ model: Model; commands?: Update.Commands<Message, R> | undefined; outMessage?: never; }>) | ((model: Model, message: Message) => Readonly<{ model: Model; commands?: Update.Commands<Message, R> | undefined; outMessage?: never; }>)
  ```

- `subscriptions` Declares Streams whose dependencies are derived from the Model. Changed dependencies
  restart their Streams.

  ```ts
  Readonly<Record<string, Subscription.Subscription<Model, Message, any, R>>> | Readonly<Record<string, Subscription.Subscription<Model, Message, any, R>>> | undefined
  ```

- `onCrash` Called once on terminal failure, with the original Cause and a Message when one triggered
  the failure. Runs before `subscribeCrash` listeners. Observer defects are logged.

  ```ts
  ((cause: Cause.Cause<unknown>, triggeringMessage: Option.Option<Message>) => void) | undefined
  ```

- `resources` Supplies all required services. Live work finishes before the Layer releases its
  resources.

  ```ts
  Layer.Layer<never, never, never> | Layer.Layer<NoInfer<R>, never, never> | undefined
  ```

### Crashed

The failure returned by `takeWhen` when its Store has crashed.
`cause` is the original crash Cause, with its annotations preserved.

### Disposed

The failure returned by `takeWhen` when its Store has been disposed.

### Inactive

The `CommitError` reason when the Store has not started delivering Messages, or React has
deactivated its Provider.

### Program

The update function and Subscriptions that describe a Foldkit application.
Pass a Program to `make` when its Commands and Subscriptions use services provided by the
surrounding Effect. Use `Config` when the Store should build its own service Layer.

- `update` Applies a Message to the Model without running side effects. Return Commands for work that
  runs after the transition.

  ```ts
  (model: Model, message: Message) => Update.Return<Model, Message, R>
  ```

- `subscriptions` Declares Streams whose dependencies are derived from the Model. Changed dependencies
  restart their Streams.

  ```ts
  Readonly<Record<string, Subscription.Subscription<Model, Message, any, R>>> | undefined
  ```

- `onCrash` Called once on terminal failure, with the original Cause and a Message when one triggered
  the failure. Runs before `subscribeCrash` listeners. Observer defects are logged.

  ```ts
  ((cause: Cause.Cause<unknown>, triggeringMessage: Option.Option<Message>) => void) | undefined
  ```

### Reentrant

The `CommitError` reason when `commit` is called while the Store is already delivering a
Message, such as from a Model listener.

### Store

A running Foldkit application, with a Model and a queue of Messages to process.
Use it to send Messages, read the current Model, and observe changes outside React.
The Store runs the Commands and Subscriptions returned by the Program.

A crash stops Message processing and releases live work. The last Model and crash Cause
remain available after a crash or disposal.

- `getModel` Reads the current Model synchronously. Snapshots must remain immutable.

  ```ts
  () => Model
  ```

- `getCrash` Reads the terminal crash Cause, retained after disposal.

  ```ts
  () => Option.Option<Cause.Cause<unknown>>
  ```

- `subscribeCrash` Calls the listener when the Store crashes. An existing crash is not replayed.
  Returns a function that removes the listener.

  ```ts
  (listener: () => void) => () => void
  ```

- `subscribe` Notifies the listener synchronously when a new Model is published or the Store is disposed.
  It does not replay the current Model. Read snapshots with `getModel`. Defects during Model
  notifications are logged.
  Returns a function that removes the listener.

  ```ts
  (listener: () => void) => () => void
  ```

- `dispatch` Queues a Message after earlier Messages. Processing may finish during this call or be
  deferred. Use `commit` when you need delivery to finish before continuing. A crashed or
  disposed Store ignores new Messages.

  ```ts
  (message: Message) => void
  ```

- `commit` Sends a Message and processes the queue through it before returning. Returned Commands
  may still be running. Use the Result to check delivery failures.

  ```ts
  (message: Message) => Result.Result<void, CommitError>
  ```

- `dispose` Creates an Effect that stops Commands and Subscriptions, then releases their services.
  Repeated calls share the same cleanup result. Cleanup defects fail the Effect.

  ```ts
  () => Effect.Effect<void>
  ```

- `isDisposed` Reports whether explicit disposal has begun. A crash alone does not mark the Store
  disposed.

  ```ts
  () => boolean
  ```

- `getRunningCommands` Lists the Commands that have started and not yet finished, in start order. Disposal
  interrupts these Commands. Their services are unknown outside the Program that returned them.

  ```ts
  () => Update.Commands<Message, unknown>
  ```

### StoreTypeId

Identifies Store instances across package entry points.
Type of the Store instance identifier.

- `toString` Returns a string representation of an object.

  ```ts
  () => string
  ```

- `valueOf` Returns the primitive value of the specified object.

  ```ts
  () => symbol
  ```

- `description` Expose the [[Description]] internal slot of a symbol directly.

  ```ts
  string | undefined
  ```

### boot

Creates a Store synchronously, with cleanup managed by the caller.
Use it when the host creates the Store outside a scoped Effect. Run `store.dispose()` when
the host no longer needs it, including when the host's work fails.

Provide required services through `config.resources`. Unlike `make`, `boot` cannot receive
services from a surrounding Effect Context.

**Example** (Using a Store with explicit cleanup)

```ts
import { Effect, Result } from "effect"
import { defineMessageUnion } from "foldkit/message"
import * as Store from "react-foldkit/store"
import { modifyFields } from "foldkit/struct"

type Model = { readonly count: number }

const Message = defineMessageUnion({ ClickedIncrement: {} })
type Message = typeof Message.Type

const store = Store.boot(
  {
    update: (model: Model, _message: Message) => ({
      model: modifyFields(model, { count: (count) => count + 1 }),
    }),
  },
  { model: { count: 0 } }
)

try {
  Result.getOrThrow(store.commit(Message.ClickedIncrement()))
} finally {
  await Effect.runPromise(store.dispose())
}
```

### commit

Creates an Effect that sends a Message and processes the queue through that Message.
Use it when subsequent Effect steps need to read the updated Model.

The Store processes earlier queued Messages first. The Effect succeeds once this Message's
update has finished. It does not wait for returned Commands to finish.

The Effect fails with `CommitError` if delivery is inactive, reentrant, disposed, or crashed.
Failure does not undo Model changes already applied. Call as `commit(store, message)` or
`store.pipe(commit(message))`.

### make

Creates a Store managed by an Effect Scope.
Use it in `Effect.scoped` or another scoped Effect so cleanup runs when that work ends.

Closing the Scope stops Commands and Subscriptions before releasing their services. Without
`resources`, the Store uses services from the calling Effect's Context. A supplied Layer is
built when live work first needs it.

**Example** (Sending a Message and reading the updated Model)

```ts
import { Effect } from "effect"
import { defineMessageUnion } from "foldkit/message"
import * as Store from "react-foldkit/store"
import { modifyFields } from "foldkit/struct"

type Model = { readonly count: number }

const Message = defineMessageUnion({ ClickedIncrement: {} })
type Message = typeof Message.Type

const update = (model: Model, _message: Message) => ({
  model: modifyFields(model, { count: (count) => count + 1 }),
})

const program = Effect.scoped(
  Effect.gen(function* () {
    const store = yield* Store.make({ update }, { model: { count: 0 } })
    yield* Store.commit(store, Message.ClickedIncrement())

    return store.getModel().count
  })
)

await Effect.runPromise(program)
```

### takeWhen

Waits for a Model value selected with `Option.Some`.
Use it to await a result produced by a Command or Subscription without polling the Store.

**Details**

The Effect checks the current Model first. If the selector returns `None`, it waits for
changes and checks again. It removes its listeners on completion or interruption.

A crashed Store fails with `Crashed`; a disposed Store fails with `Disposed`. These failures
take priority even if the last Model matches. Exceptions from the selector become defects.

**Example** (Waiting for a loaded project title)

```ts
import { Effect, Option, Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import * as Store from "react-foldkit/store"
import { modifyFields } from "foldkit/struct"

type Model = { readonly projectTitle: Option.Option<string> }

const Message = defineMessageUnion({ LoadedProject: { title: Schema.String } })
type Message = typeof Message.Type

const program = Effect.scoped(
  Effect.gen(function* () {
    const store = yield* Store.make(
      {
        update: (model: Model, message: Message) => ({
          model: modifyFields(model, { projectTitle: () => Option.some(message.title) }),
        }),
      },
      {
        model: { projectTitle: Option.none<string>() },
        commands: [
          { name: "LoadProject", effect: Effect.succeed(Message.LoadedProject({ title: "Foldkit" })) },
        ],
      }
    )

    return yield* Store.takeWhen(store, (model) => model.projectTitle)
  })
)

await Effect.runPromise(program)
```

## react-foldkit/submodel

### Field

A child stored in one field of its parent Model, described once for both halves of the
Submodel. Pass it to a Submodel Provider or `useSubmodel` as a `Lift`, and call `fold`
from the parent update to run the child update and write the result back.

- `key` The parent field that holds the child Model.

  ```ts
  string
  ```

- `write` Replaces the child Model, returning the same parent when the child is unchanged.

  ```ts
  (model: ParentModel, child: Model) => ParentModel
  ```

- `fold` Runs the child update and folds its Model, Commands, and OutMessage into the parent.
  Call as `fold(model, message)` or `fold(message)` for a Step.

  ```ts
  FoldResult
  ```

- `read` Projects a child Model. Keep this function pure and its declaration stable across renders.

  ```ts
  (model: ParentModel) => Model
  ```

- `toParentMessage` Converts a child Message into the Message handled by the parent update.

  ```ts
  (message: Message) => ParentMessage
  ```

### Lift

Description of a child that is always present in a parent Model. Use it with
`useSubmodel` to derive the child's source and route its Messages to the parent.

- `read` Projects a child Model. Keep this function pure and its declaration stable across renders.

  ```ts
  (model: ParentModel) => Model
  ```

- `toParentMessage` Converts a child Message into the Message handled by the parent update.

  ```ts
  (message: Message) => ParentMessage
  ```

### OptionalLift

Description of a child that may be absent from a parent Model. Use it with
`useOptionalSubmodel` to expose a child source while the child exists.

- `read` Returns the current child Model or `None`. Keep this function pure and stable across renders.

  ```ts
  (model: ParentModel) => Option.Option<Model>
  ```

- `toParentMessage` Converts a child Message into the Message handled by the parent update.

  ```ts
  (message: Message) => ParentMessage
  ```

### ProviderError

Thrown when a required Submodel hook is called outside its matching Provider.

### ProviderProps

Props for a Submodel Provider. Pass the parent hooks and a lift to derive the child source,
or pass a source you already derived.

- `children`

  ```ts
  React.ReactNode
  ```

- `from` The parent application or Submodel whose Model holds this child.

  ```ts
  Pick<ModelHooks<ParentModel, ParentMessage>, "useSubmodel"> | undefined
  ```

- `lift` Reads the child from the parent Model and lifts its Messages. Declare it outside render.

  ```ts
  Lift<ParentModel, ParentMessage, Model, Message> | undefined
  ```

- `source` A child source derived with `useSubmodel` or `useOptionalSubmodel`.

  ```ts
  ModelSource<Model, Message> | undefined
  ```

### Submodel

React binding for a child Model owned by its parent, returned by `define`. Use
its Provider to give child views a lifted source without starting another Store.

- `Provider` Supplies the parent-owned child to child hooks, from a parent and lift or from a source.
  It does not acquire services or start Commands.

  ```ts
  <ParentModel = never, ParentMessage = never>(props: ProviderProps<Model, Message, ParentModel, ParentMessage>) => React.ReactNode
  ```

- `useModel` Subscribes the view to the Model or a selected value. Pass a selector to read only the
  value the view needs. Whole Models use `Object.is`. Selections use `Equal.equals`, which
  compares plain objects and arrays structurally on every Model change; pass `isEqual` when
  a selection is large or already reference-stable. Throws outside the matching Provider.

  ```ts
  { (): Model; <Selected>(selector: (model: Model) => Selected, isEqual?: ((a: Selected, b: Selected) => boolean) | undefined): Selected; }
  ```

- `useDispatch` Returns a function that sends Messages to the owning application. It does not confirm
  delivery or wait for Commands. Throws outside the matching Provider.

  ```ts
  () => (message: Message) => void
  ```

- `useOptionalModel` Reads `Some(Model)` inside the matching Provider and `None` outside it.

  ```ts
  () => Option.Option<Model>
  ```

- `useOptionalDispatch` Returns `Some(dispatch)` inside the matching Provider and `None` outside it.

  ```ts
  () => Option.Option<(message: Message) => void>
  ```

- `useInbound` Sends a Message whenever an external value changes, such as a route parameter or prop.
  The first value is not sent; include it in `init`. Values are compared with `isEqual`,
  which defaults to `Equal.equals`. Throws outside the matching Provider.

  ```ts
  <A>(value: A, toMessage: (value: A) => Message, isEqual?: ((previous: A, next: A) => boolean) | undefined) => void
  ```

- `useSubmodel` Creates a source for a child Submodel from this Provider's Model. The lift reads the child
  Model and wraps its Messages for the parent. The child shares the parent Store and
  subscription. Declare the lift outside render, or memoize it: a new `read` or
  `toParentMessage` creates a new source. Throws outside the matching Provider.

  ```ts
  <ChildModel, ChildMessage>(projection: Lift<Model, Message, ChildModel, ChildMessage>) => ModelSource<ChildModel, ChildMessage>
  ```

- `useOptionalSubmodel` Returns `None` while the child Model is absent. A previously created source retains its
  last Model while absent and resumes when the child returns. Throws outside the matching
  parent Provider.

  ```ts
  <ChildModel, ChildMessage>(projection: import("./lift").OptionalLift<Model, Message, ChildModel, ChildMessage>) => Option.Option<ModelSource<ChildModel, ChildMessage>>
  ```

### define

Creates a child Provider and hooks for a parent-owned Model source.

The Provider forwards snapshots and Messages through its `source` prop. It does not create a
Store, acquire services, or start Commands. Required hooks throw `ProviderError`
outside this Provider; optional hooks return `None`.

**Example** (Sharing a parent-owned counter with a child view)

```tsx
import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import * as Submodel from "react-foldkit/submodel"

export const Model = Schema.Struct({ count: Schema.Finite })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({ Incremented: {} })
export type Message = typeof Message.Type

export const { Provider, useModel } = Submodel.define<Model, Message>()

export function View() {
  const count = useModel((model) => model.count)

  return <span>{count}</span>
}
```

### field

Describes a child stored in one field of the parent Model. The result reads and writes that
field, lifts child Messages, and folds the child update, so the view and update halves share
one declaration. Supply the parent Model type first.

**Example** (Embedding a form in a parent Model)

```ts
// form.ts owns the child Model, Message, and update.
import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"

export const Model = Schema.Struct({ draft: Schema.String })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({ ChangedDraft: { text: Schema.String } })
export type Message = typeof Message.Type

export const update = (model: Model, message: Message) => ({
  model: modifyFields(model, { draft: () => message.text }),
})

// app.ts embeds the form and folds its Messages.
import * as Form from "./form"
import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import * as Submodel from "react-foldkit/submodel"

const Model = Schema.Struct({ form: Form.Model })
type Model = typeof Model.Type

const Message = defineMessageUnion({ GotFormMessage: { message: Form.Message } })
type Message = typeof Message.Type

export const form = Submodel.field<Model>()("form", {
  update: Form.update,
  toParentMessage: (message: Form.Message) => Message.GotFormMessage({ message }),
})

export const update = (model: Model, message: Message) =>
  Message.match(message, { GotFormMessage: ({ message }) => form.fold(model, message) })
```

### lift

Declares a child Model read and Message lift while preserving their inferred types.

In real code the child owns canonical `Model` and `Message` names in its own module,
imported below as `Counter`.

**Example** (Reading a child and lifting its Message)

```ts
// counter.ts owns the child Model and Message.
import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"

export const Model = Schema.Struct({ count: Schema.Finite })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({ Incremented: {} })
export type Message = typeof Message.Type

// app.ts lifts counter messages into its own Message.
import * as Counter from "./counter"
import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import * as Submodel from "react-foldkit/submodel"

const Model = Schema.Struct({ counter: Counter.Model })
type Model = typeof Model.Type

const Message = defineMessageUnion({ GotCounterMessage: { message: Counter.Message } })

export const counter = Submodel.lift({
  read: (model: Model) => model.counter,
  toParentMessage: (message: Counter.Message) => Message.GotCounterMessage({ message }),
})
```

## react-foldkit/eslint

### default

Flat ESLint configuration for Command execution, Store ownership, navigation, and child
Views that receive Model data through props.

Enables the four architecture rules as errors and warns about Submodel lifts built during
render. Local React state remains unrestricted by this preset.

### recommendedConfig

Flat ESLint configuration for Command execution, Store ownership, navigation, and child
Views that receive Model data through props.

Enables the four architecture rules as errors and warns about Submodel lifts built during
render. Local React state remains unrestricted by this preset.

### strictConfig

Flat ESLint configuration that adds the local-state warning to the recommended architecture
rules.

## react-foldkit/commitSource

### CommitEntry

One delivery in a commit-source snapshot. Sources use its key and version to identify an
external Message so the Provider can avoid repeating its delivery.

The key identifies an entry within its source. The version identifies the delivery,
independently of the Message object's identity.

- `key` Identifies an entry within the source. Each snapshot must contain at most one entry for a
  key.

  ```ts
  string
  ```

- `version` Compared with the last successfully delivered version for this key using `Object.is`.
  Change it to request another delivery.

  ```ts
  string | number
  ```

- `message`

  ```ts
  Message
  ```

### CommitSource

Adapter between an external data source and an application Provider. Use it to turn
external values into Messages during initialization and live updates.

**Details**

The Provider folds the initial snapshot during render, then commits changed entries after
activation. Successfully delivered versions remain recorded across reconnects. Removing a
key from a reconciled snapshot forgets its recorded version.

**Gotchas**

Reads and construction must not acquire resources. Acquire live resources in `subscribe` and
release them in its cleanup. Notifications during reconciliation must not recursively
publish another snapshot.

- `getSnapshot` Reads the current snapshot synchronously. Returns source failures as `Result` data and
  performs no side effects.

  ```ts
  () => Result.Result<ReadonlyArray<CommitEntry<Message>>, E>
  ```

- `subscribe` Registers publication notifications and returns cleanup. After a notification,
  `getSnapshot` must expose the published snapshot.

  ```ts
  (notify: () => void) => () => void
  ```

### CommitSourceError

Failure caused by duplicate snapshot keys or a source notification during reconciliation.
Handle one reason with `Effect.catchReason("CommitSourceError", "DuplicateKey", ...)`.

### DuplicateKey

The `CommitSourceError` reason when a snapshot contains more than one entry for a key.

### ReentrantNotification

The `CommitSourceError` reason when a source notifies while the Provider is still reconciling
its previous notification.

## react-foldkit/loader

### Config

The name, payload Schema, and resource key used to create a Loader with `define`.
The name identifies which declaration decodes the data. The key identifies which resource
was loaded, such as a project ID.

`define` converts the Schema to a JSON codec with `Schema.toCodecJson`. The key is calculated
from decoded data and checked again when the result is decoded.

- `name` Identifies the declaration in envelopes. Use a distinct name for each registry entry.

  ```ts
  string
  ```

- `data` Schema for the data returned by the loading Effect. It must support `Schema.toCodecJson`.

  ```ts
  Schema.Codec<A, I, never, never>
  ```

- `key` Identifies the loaded resource, such as a project ID. The same resource must have the same key.

  ```ts
  (data: NoInfer<A>) => string
  ```

### Declaration

A named decoder that turns loader data into application Messages.
Pass declarations to a router adapter such as `TanStack.make` so it can recognize and decode
results returned by your route loaders.

Decoding checks the envelope and payload before creating a Message. It does not load data.

- `name` Identifies which loader data this declaration decodes. A registry rejects repeated names.

  ```ts
  string
  ```

- `decodeDelivery` Returns the decoded Message and receipt, or a `SchemaError`. Exceptions from key or Message
  callbacks remain thrown exceptions.

  ```ts
  (envelope: unknown) => Result.Result<Delivery<Message>, Schema.SchemaError>
  ```

- `decode` Returns the decoded Message without its receipt. Validation failures are `SchemaError`
  values.

  ```ts
  (envelope: unknown) => Result.Result<Message, Schema.SchemaError>
  ```

- `pipe`

  ```ts
  { <A>(this: A): A; <A, B = never>(this: A, ab: (_: A) => B): B; <A, B = never, C = never>(this: A, ab: (_: A) => B, bc: (_: B) => C): C; <A, B = never, C = never, D = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D): D; <A, B = never, C = never, D = never, E = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E): E; <A, B = never, C = never, D = never, E = never, F = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F): F; <A, B = never, C = never, D = never, E = never, F = never, G = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G): G; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H): H; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I): I; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J): J; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K): K; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L): L; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M): M; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never, N = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M, mn: (_: M) => N): N; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never, N = never, O = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M, mn: (_: M) => N, no: (_: N) => O): O; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never, N = never, O = never, P = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M, mn: (_: M) => N, no: (_: N) => O, op: (_: O) => P): P; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never, N = never, O = never, P = never, Q = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M, mn: (_: M) => N, no: (_: N) => O, op: (_: O) => P, pq: (_: P) => Q): Q; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never, N = never, O = never, P = never, Q = never, R = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M, mn: (_: M) => N, no: (_: N) => O, op: (_: O) => P, pq: (_: P) => Q, qr: (_: Q) => R): R; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never, N = never, O = never, P = never, Q = never, R = never, S = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M, mn: (_: M) => N, no: (_: N) => O, op: (_: O) => P, pq: (_: P) => Q, qr: (_: Q) => R, rs: (_: R) => S): S; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never, N = never, O = never, P = never, Q = never, R = never, S = never, T = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M, mn: (_: M) => N, no: (_: N) => O, op: (_: O) => P, pq: (_: P) => Q, qr: (_: Q) => R, rs: (_: R) => S, st: (_: S) => T): T; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never, N = never, O = never, P = never, Q = never, R = never, S = never, T = never, U = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M, mn: (_: M) => N, no: (_: N) => O, op: (_: O) => P, pq: (_: P) => Q, qr: (_: Q) => R, rs: (_: R) => S, st: (_: S) => T, tu: (_: T) => U): U; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never, N = never, O = never, P = never, Q = never, R = never, S = never, T = never, U = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M, mn: (_: M) => N, no: (_: N) => O, op: (_: O) => P, pq: (_: P) => Q, qr: (_: Q) => R, rs: (_: R) => S, st: (_: S) => T, tu: (_: T) => U): U; }
  ```

### Delivery

A Message decoded from loader data, together with the receipt used to track its delivery.
Router adapters use the receipt to avoid sending the same loaded result more than once.

- `receipt` Identifies which loaded result produced this Message.

  ```ts
  { readonly name: string; readonly key: string; readonly version: string; }
  ```

- `message`

  ```ts
  Message
  ```

### Envelope

The encoded result returned by a Loader's loading Effect.
Return it as route loader data so a router adapter can turn the result into an application
Message. It contains the encoded payload and the identity used to track its delivery.

The matching declaration checks the format, name, payload, and resource key before decoding.

- `payload`

  ```ts
  I
  ```

- `_tag`

  ```ts
  "react-foldkit/Loader"
  ```

- `name`

  ```ts
  string
  ```

- `key`

  ```ts
  string
  ```

- `version`

  ```ts
  string
  ```

- `format`

  ```ts
  1
  ```

### FromKeyedQueryOptions

Options for naming a keyed Query Loader and identifying its resources.
Use `key` when your application has a resource ID that should replace the default key derived
from the Query arguments.

- `key` Receives decoded arguments. Defaults to canonical JSON of their encoded form, with object
  keys sorted recursively.

  ```ts
  ((args: Args) => string) | undefined
  ```

- `name` Defaults to the Query Fetch Command name. Override it when multiple declarations would
  share a registry name.

  ```ts
  string | undefined
  ```

### FromQueryOptions

Options for naming a Query Loader declaration.
Override the name when registering two Loaders whose Queries have the same Fetch Command name.

- `name` Defaults to the Query Fetch Command name. Override it when multiple declarations would
  share a registry name.

  ```ts
  string | undefined
  ```

### KeyedQueryLoader

A Loader for a Foldkit Query whose resources are identified by arguments.
Use it to load a resource in a route loader and deliver both its arguments and result to the
application. For example, a project route can load `{ projectId }` without starting a Store.

`Load` is the payload Schema for an application Message. `loadQuery(args)` creates the Effect
that runs the Query and encodes `{ args, result }`.

- `query` Query used to load the data. Use it to read or update the corresponding Query Model.

  ```ts
  KeyedQuery<Name, A, AI, E, EI, Fields, R, Interrupt>
  ```

- `loadQuery` Executes the Query with these arguments when run and encodes its outcome. Query failures
  become AsyncData payloads; encoding failures use `SchemaError`.

  ```ts
  (args: KeyedArgs<Fields>) => Effect.Effect<Envelope<Schema.Json>, Schema.SchemaError, R>
  ```

- `data` Schema used to encode loaded data and decode it when delivered.

  ```ts
  Schema.Codec<KeyedLoadType<Fields, A, E>, Schema.Json, never, never>
  ```

- `key` Derives a resource key from decoded data. Exceptions from this callback remain defects
  during loading or throws during decoding.

  ```ts
  (data: KeyedLoadType<Fields, A, E>) => string
  ```

- `load` Creates the Effect that loads and encodes data. Each execution gets a new delivery version
  from an available Crypto service or Web Crypto. Crypto failures become defects.

  ```ts
  <E, R>(effect: Effect.Effect<KeyedLoadType<Fields, A, E>, E, R>) => Effect.Effect<{ readonly payload: Schema.Json; readonly _tag: "react-foldkit/Loader"; readonly name: string; readonly key: string; readonly version: string; readonly format: 1; }, Schema.SchemaError | E, R>
  ```

- `name` Identifies which loader data this declaration decodes. A registry rejects repeated names.

  ```ts
  string
  ```

- `decodeDelivery` Returns the decoded Message and receipt, or a `SchemaError`. Exceptions from key or Message
  callbacks remain thrown exceptions.

  ```ts
  (envelope: unknown) => Result.Result<Delivery<KeyedLoadType<Fields, A, E>>, Schema.SchemaError>
  ```

- `decode` Returns the decoded Message without its receipt. Validation failures are `SchemaError`
  values.

  ```ts
  (envelope: unknown) => Result.Result<KeyedLoadType<Fields, A, E>, Schema.SchemaError>
  ```

- `pipe`

  ```ts
  { <A>(this: A): A; <A, B = never>(this: A, ab: (_: A) => B): B; <A, B = never, C = never>(this: A, ab: (_: A) => B, bc: (_: B) => C): C; <A, B = never, C = never, D = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D): D; <A, B = never, C = never, D = never, E = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E): E; <A, B = never, C = never, D = never, E = never, F = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F): F; <A, B = never, C = never, D = never, E = never, F = never, G = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G): G; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H): H; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I): I; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J): J; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K): K; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L): L; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M): M; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never, N = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M, mn: (_: M) => N): N; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never, N = never, O = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M, mn: (_: M) => N, no: (_: N) => O): O; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never, N = never, O = never, P = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M, mn: (_: M) => N, no: (_: N) => O, op: (_: O) => P): P; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never, N = never, O = never, P = never, Q = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M, mn: (_: M) => N, no: (_: N) => O, op: (_: O) => P, pq: (_: P) => Q): Q; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never, N = never, O = never, P = never, Q = never, R = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M, mn: (_: M) => N, no: (_: N) => O, op: (_: O) => P, pq: (_: P) => Q, qr: (_: Q) => R): R; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never, N = never, O = never, P = never, Q = never, R = never, S = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M, mn: (_: M) => N, no: (_: N) => O, op: (_: O) => P, pq: (_: P) => Q, qr: (_: Q) => R, rs: (_: R) => S): S; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never, N = never, O = never, P = never, Q = never, R = never, S = never, T = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M, mn: (_: M) => N, no: (_: N) => O, op: (_: O) => P, pq: (_: P) => Q, qr: (_: Q) => R, rs: (_: R) => S, st: (_: S) => T): T; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never, N = never, O = never, P = never, Q = never, R = never, S = never, T = never, U = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M, mn: (_: M) => N, no: (_: N) => O, op: (_: O) => P, pq: (_: P) => Q, qr: (_: Q) => R, rs: (_: R) => S, st: (_: S) => T, tu: (_: T) => U): U; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never, N = never, O = never, P = never, Q = never, R = never, S = never, T = never, U = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M, mn: (_: M) => N, no: (_: N) => O, op: (_: O) => P, pq: (_: P) => Q, qr: (_: Q) => R, rs: (_: R) => S, st: (_: S) => T, tu: (_: T) => U): U; }
  ```

- `Load` Schema for the Query arguments and result delivered to the application. Use it as a field
  in the Message that receives route loader data. Queries without arguments include only `result`.

  ```ts
  LoadSchema
  ```

### LoadPayload

The arguments and result of a Query loaded outside the application Store.
Use this payload in a Message so update can apply the result to the Query entry identified
by `args`. A failed Query is carried in `result` as `AsyncData.Failure`.

- `args` Decoded Query arguments that identify the resource.

  ```ts
  Args
  ```

- `result` Settled Query outcome. Query failures travel as AsyncData rather than as transport
  failures.

  ```ts
  AsyncData.AsyncData<A, E>
  ```

### Loader

A declaration that can also load data and encode it for delivery to the application.
Use `load` in a route loader, then let the router adapter decode its result into a Message.

By default, the decoded Message is the loaded data itself. Use `mapMessages` to wrap that data
in one of your application's Messages.

- `data` Schema used to encode loaded data and decode it when delivered.

  ```ts
  Schema.Codec<A, I, never, never>
  ```

- `key` Derives a resource key from decoded data. Exceptions from this callback remain defects
  during loading or throws during decoding.

  ```ts
  (data: A) => string
  ```

- `load` Creates the Effect that loads and encodes data. Each execution gets a new delivery version
  from an available Crypto service or Web Crypto. Crypto failures become defects.

  ```ts
  <E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<Envelope<I>, E | Schema.SchemaError, R>
  ```

- `name` Identifies which loader data this declaration decodes. A registry rejects repeated names.

  ```ts
  string
  ```

- `decodeDelivery` Returns the decoded Message and receipt, or a `SchemaError`. Exceptions from key or Message
  callbacks remain thrown exceptions.

  ```ts
  (envelope: unknown) => Result.Result<Delivery<Message>, Schema.SchemaError>
  ```

- `decode` Returns the decoded Message without its receipt. Validation failures are `SchemaError`
  values.

  ```ts
  (envelope: unknown) => Result.Result<Message, Schema.SchemaError>
  ```

- `pipe`

  ```ts
  { <A>(this: A): A; <A, B = never>(this: A, ab: (_: A) => B): B; <A, B = never, C = never>(this: A, ab: (_: A) => B, bc: (_: B) => C): C; <A, B = never, C = never, D = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D): D; <A, B = never, C = never, D = never, E = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E): E; <A, B = never, C = never, D = never, E = never, F = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F): F; <A, B = never, C = never, D = never, E = never, F = never, G = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G): G; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H): H; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I): I; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J): J; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K): K; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L): L; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M): M; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never, N = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M, mn: (_: M) => N): N; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never, N = never, O = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M, mn: (_: M) => N, no: (_: N) => O): O; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never, N = never, O = never, P = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M, mn: (_: M) => N, no: (_: N) => O, op: (_: O) => P): P; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never, N = never, O = never, P = never, Q = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M, mn: (_: M) => N, no: (_: N) => O, op: (_: O) => P, pq: (_: P) => Q): Q; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never, N = never, O = never, P = never, Q = never, R = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M, mn: (_: M) => N, no: (_: N) => O, op: (_: O) => P, pq: (_: P) => Q, qr: (_: Q) => R): R; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never, N = never, O = never, P = never, Q = never, R = never, S = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M, mn: (_: M) => N, no: (_: N) => O, op: (_: O) => P, pq: (_: P) => Q, qr: (_: Q) => R, rs: (_: R) => S): S; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never, N = never, O = never, P = never, Q = never, R = never, S = never, T = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M, mn: (_: M) => N, no: (_: N) => O, op: (_: O) => P, pq: (_: P) => Q, qr: (_: Q) => R, rs: (_: R) => S, st: (_: S) => T): T; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never, N = never, O = never, P = never, Q = never, R = never, S = never, T = never, U = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M, mn: (_: M) => N, no: (_: N) => O, op: (_: O) => P, pq: (_: P) => Q, qr: (_: Q) => R, rs: (_: R) => S, st: (_: S) => T, tu: (_: T) => U): U; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never, N = never, O = never, P = never, Q = never, R = never, S = never, T = never, U = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M, mn: (_: M) => N, no: (_: N) => O, op: (_: O) => P, pq: (_: P) => Q, qr: (_: Q) => R, rs: (_: R) => S, st: (_: S) => T, tu: (_: T) => U): U; }
  ```

### QueryLoader

A Loader for a Foldkit Query that takes no arguments.
Use it to load a single resource, such as the current user's profile, outside the Store and
deliver its result to the application.

`Load` is the payload Schema for an application Message. `loadQuery` is the Effect that runs
the Query and encodes `{ result }`. Its resource key is `singleton`.

- `query` Query used to load the data. Use it to read or update the corresponding Query Model.

  ```ts
  Query<Name, A, AI, E, EI, R, Interrupt>
  ```

- `loadQuery` Executes the Query when run and encodes its outcome. Query failures become AsyncData
  payloads; encoding failures use `SchemaError`.

  ```ts
  Effect.Effect<{ readonly payload: Schema.Json; readonly _tag: "react-foldkit/Loader"; readonly name: string; readonly key: string; readonly version: string; readonly format: 1; }, Schema.SchemaError, R>
  ```

- `data` Schema used to encode loaded data and decode it when delivered.

  ```ts
  Schema.Codec<LoadType<A, E>, Schema.Json, never, never>
  ```

- `key` Derives a resource key from decoded data. Exceptions from this callback remain defects
  during loading or throws during decoding.

  ```ts
  (data: LoadType<A, E>) => string
  ```

- `load` Creates the Effect that loads and encodes data. Each execution gets a new delivery version
  from an available Crypto service or Web Crypto. Crypto failures become defects.

  ```ts
  <E, R>(effect: Effect.Effect<LoadType<A, E>, E, R>) => Effect.Effect<{ readonly payload: Schema.Json; readonly _tag: "react-foldkit/Loader"; readonly name: string; readonly key: string; readonly version: string; readonly format: 1; }, Schema.SchemaError | E, R>
  ```

- `name` Identifies which loader data this declaration decodes. A registry rejects repeated names.

  ```ts
  string
  ```

- `decodeDelivery` Returns the decoded Message and receipt, or a `SchemaError`. Exceptions from key or Message
  callbacks remain thrown exceptions.

  ```ts
  (envelope: unknown) => Result.Result<Delivery<LoadType<A, E>>, Schema.SchemaError>
  ```

- `decode` Returns the decoded Message without its receipt. Validation failures are `SchemaError`
  values.

  ```ts
  (envelope: unknown) => Result.Result<LoadType<A, E>, Schema.SchemaError>
  ```

- `pipe`

  ```ts
  { <A>(this: A): A; <A, B = never>(this: A, ab: (_: A) => B): B; <A, B = never, C = never>(this: A, ab: (_: A) => B, bc: (_: B) => C): C; <A, B = never, C = never, D = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D): D; <A, B = never, C = never, D = never, E = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E): E; <A, B = never, C = never, D = never, E = never, F = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F): F; <A, B = never, C = never, D = never, E = never, F = never, G = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G): G; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H): H; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I): I; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J): J; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K): K; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L): L; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M): M; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never, N = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M, mn: (_: M) => N): N; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never, N = never, O = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M, mn: (_: M) => N, no: (_: N) => O): O; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never, N = never, O = never, P = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M, mn: (_: M) => N, no: (_: N) => O, op: (_: O) => P): P; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never, N = never, O = never, P = never, Q = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M, mn: (_: M) => N, no: (_: N) => O, op: (_: O) => P, pq: (_: P) => Q): Q; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never, N = never, O = never, P = never, Q = never, R = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M, mn: (_: M) => N, no: (_: N) => O, op: (_: O) => P, pq: (_: P) => Q, qr: (_: Q) => R): R; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never, N = never, O = never, P = never, Q = never, R = never, S = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M, mn: (_: M) => N, no: (_: N) => O, op: (_: O) => P, pq: (_: P) => Q, qr: (_: Q) => R, rs: (_: R) => S): S; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never, N = never, O = never, P = never, Q = never, R = never, S = never, T = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M, mn: (_: M) => N, no: (_: N) => O, op: (_: O) => P, pq: (_: P) => Q, qr: (_: Q) => R, rs: (_: R) => S, st: (_: S) => T): T; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never, N = never, O = never, P = never, Q = never, R = never, S = never, T = never, U = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M, mn: (_: M) => N, no: (_: N) => O, op: (_: O) => P, pq: (_: P) => Q, qr: (_: Q) => R, rs: (_: R) => S, st: (_: S) => T, tu: (_: T) => U): U; <A, B = never, C = never, D = never, E = never, F = never, G = never, H = never, I = never, J = never, K = never, L = never, M = never, N = never, O = never, P = never, Q = never, R = never, S = never, T = never, U = never>(this: A, ab: (_: A) => B, bc: (_: B) => C, cd: (_: C) => D, de: (_: D) => E, ef: (_: E) => F, fg: (_: F) => G, gh: (_: G) => H, hi: (_: H) => I, ij: (_: I) => J, jk: (_: J) => K, kl: (_: K) => L, lm: (_: L) => M, mn: (_: M) => N, no: (_: N) => O, op: (_: O) => P, pq: (_: P) => Q, qr: (_: Q) => R, rs: (_: R) => S, st: (_: S) => T, tu: (_: T) => U): U; }
  ```

- `Load` Schema for the Query arguments and result delivered to the application. Use it as a field
  in the Message that receives route loader data. Queries without arguments include only `result`.

  ```ts
  LoadSchema
  ```

### Receipt

Schema for the identity attached to a loaded result.

Router adapters use the name, key, and version to track which results they have delivered.
A version identifies one loading execution. It does not say how fresh the data is.
The identity of a loaded result, used by router adapters to avoid repeated delivery.
`name` identifies the Loader declaration, `key` identifies the resource, and `version`
identifies one loading execution. Compare revisions in your data to decide freshness.

- `name`

  ```ts
  string
  ```

- `key`

  ```ts
  string
  ```

- `version`

  ```ts
  string
  ```

### SettleQueryIfOptions

The policy for accepting a result loaded outside the Store into a Query Model.
Use a data revision or timestamp to reject older results. Choose whether an incoming failure
should replace the current Query state.

- `fresher` Compares an incoming success with existing data. Return `false` to keep the Model. A
  success without existing data is accepted without calling this function. Defaults to
  accepting every incoming success, which suits data without a revision or timestamp.

  ```ts
  ((incoming: A, current: A) => boolean) | undefined
  ```

- `acceptFailure` Decides whether to accept a failure. Defaults to accepting only when the current state has
  neither data nor a pending request.

  ```ts
  ((current: AsyncData.AsyncData<A, E>) => boolean) | undefined
  ```

### define

Creates a Loader that encodes loaded data and decodes it back into the same data type.

Give each declaration a unique name in its router registry. Choose a stable key for each
resource, such as a project ID. The returned Loader uses a JSON codec derived from `data`.
Creating the Loader does not execute any Effect.

### fromQuery

Creates a Loader from a Foldkit Query for use in route loaders.

The returned `Load` Schema describes the payload for that Message. Keyed Queries produce
`{ args, result }`; Queries without arguments produce `{ result }`. Query failures are
included as `AsyncData.Failure`, so the application can handle them in update.

**Details**

The declaration name defaults to `query.Fetch.name`. Queries without arguments use the key
`singleton`. Keyed Queries use JSON of their encoded arguments with object keys sorted,
unless you supply `key`. These delivery keys are separate from the Query's cache keys.

**Example** (Creating a Query Loader and its Message)

```ts
import { Effect, Schema } from "effect"
import * as Query from "foldkit/experimental/query"
import * as Loader from "react-foldkit/loader"
import { defineMessageUnion } from "foldkit/message"

const Project = Schema.Struct({ id: Schema.String, title: Schema.String })

const query = Query.define({
  name: "Project",
  args: { projectId: Schema.String },
  data: Project,
  error: Schema.String,
  execute: ({ projectId }) => Effect.succeed({ id: projectId, title: "Foldkit" }),
})

export const loader = Loader.fromQuery(query)

export const Message = defineMessageUnion({ CompletedLoadProject: { load: loader.Load } })
```

### load

Creates an Effect that loads data and encodes it for delivery through a router adapter.
Run this Effect in a route loader and return its envelope as the route's loader data.

**Details**

The Effect keeps the supplied Effect's failures and required services. Encoding can fail
with `SchemaError`. Each execution creates a new delivery version using an available
`Crypto` service or Web Crypto. Crypto failures and exceptions from `key` become defects.

**Example** (Creating a project loading Effect)

```ts
import { Effect, Schema } from "effect"
import * as Loader from "react-foldkit/loader"

const Project = Schema.Struct({ id: Schema.String, title: Schema.String })

const loader = Loader.define({ name: "Project", data: Project, key: (project) => project.id })

export const load = () => Loader.load(loader, Effect.succeed({ id: "p1", title: "Foldkit" }))
```

### loadQuery

Creates the Effect that runs a Query Loader and encodes its result for delivery.

For a Query without arguments, call `loadQuery(loader)`. For a keyed Query, call
`loadQuery(loader, args)` or `loader.pipe(loadQuery(args))`. The Query runs only when you
execute the returned Effect.

Query failures are encoded as `AsyncData.Failure`. Encoding failures use `SchemaError`, and
the Effect requires the same services as the Query.

### mapMessages

Maps a Loader's decoded result to an application Message.
Use the returned declaration in your router registry. Loading still uses the same payload
Schema, resource key, and delivery version.

**Gotchas**

The returned value is a plain Loader. If you started with a Query Loader, keep the original
value to call `loadQuery` or use its `Load` Schema.

**Example** (Turning a loaded project into a Message)

```ts
import { Schema } from "effect"
import * as Loader from "react-foldkit/loader"
import { defineMessageUnion } from "foldkit/message"

const Project = Schema.Struct({ id: Schema.String, title: Schema.String })

const Message = defineMessageUnion({ LoadedProject: { project: Project } })

const loader = Loader.define({ name: "Project", data: Project, key: (project) => project.id })

export const declaration = loader.pipe(Loader.mapMessages((project) => Message.LoadedProject({ project })))
```

### settleQueryIf

Applies a result loaded outside the Store to a Query Model when your acceptance policy allows it.
Use it in update to reconcile route loader data with data already held by the Query.

**Details**

A success is accepted when there is no current data, no `fresher` is given, or `fresher`
returns true. Failures follow
`acceptFailure`. By default, a failure is accepted only when the Query has no data and no
pending request. Initial and pending results are ignored. Rejected results leave the Model unchanged.

An accepted result replaces the Query state and prevents older in-flight fetches from
replacing it later. The helper returns cancellation Commands for interruptible Queries.
Return those Commands from update so the Store can stop the obsolete work. This helper does
not start a fetch.

**Example** (Keeping the newest project revision)

```ts
import { Effect, Schema } from "effect"
import * as Query from "foldkit/experimental/query"
import * as AsyncData from "foldkit/asyncData"
import * as Loader from "react-foldkit/loader"

const Project = Schema.Struct({ title: Schema.String, revision: Schema.Finite })

const query = Query.define({
  name: "Project",
  data: Project,
  error: Schema.String,
  execute: Effect.succeed({ title: "Draft", revision: 1 }),
})

export const settled = Loader.settleQueryIf(
  query,
  query.init(),
  AsyncData.Success({ data: { title: "Published", revision: 2 } }),
  { fresher: (incoming, current) => incoming.revision > current.revision }
)
```

## react-foldkit/tanstack

### DecodeFailure

A route's loader data that looked like a Loader envelope but could not be decoded.

- `error` The validation failure.

  ```ts
  Schema.SchemaError
  ```

- `matchId` The TanStack route match whose loader data failed.

  ```ts
  string
  ```

- `declarationName` The envelope's declaration name, or `None` when the name itself was malformed.

  ```ts
  Option.Option<string>
  ```

### MakeOptions

Options for a TanStack commit source.

- `onDecodeError` Turns undecodable loader data into a Message for update, so one bad route payload does not
  fail the whole Provider. Without it, decode failures fail the snapshot with `SchemaError`.

  ```ts
  ((failure: DecodeFailure) => Message) | undefined
  ```

### RegistryError

Failure from creating a TanStack commit source with duplicate declaration names.

### make

Creates a commit source that turns TanStack Router loader data into application Messages.
Pass the source as the application Provider's `commitSource` so loaded route data reaches update.

Register the Loader declarations used by your routes. For each successful route match, the
source decodes loader data with the declaration whose name matches the envelope. Other
loader data and envelopes with unregistered names are ignored.

**Details**

Duplicate declaration names return `RegistryError` when you create the source. Malformed
envelope names and validation failures for registered declarations return `SchemaError`
from `getSnapshot`, unless `onDecodeError` turns each failure into a Message for update.
Exceptions from your key or Message callbacks remain thrown exceptions.

Creating the source does not load routes or subscribe to the router. The Provider owns the
subscription and removes it on deactivation. Subscription requires a reactive matches store
and throws if the router does not provide one.

**Example** (Delivering a route's loaded project)

```ts
import { createRootRoute, createRouter } from "@tanstack/react-router"
import { Effect, Result, Schema } from "effect"
import * as Loader from "react-foldkit/loader"
import { defineMessageUnion } from "foldkit/message"
import * as TanStack from "react-foldkit/tanstack"

const Project = Schema.Struct({ id: Schema.String, title: Schema.String })

const Message = defineMessageUnion({ LoadedProject: { project: Project } })

const loader = Loader.define({ name: "Project", data: Project, key: (project) => project.id })

const declaration = loader.pipe(Loader.mapMessages((project) => Message.LoadedProject({ project })))

const route = createRootRoute({
  loader: () => Effect.runPromise(loader.load(Effect.succeed({ id: "p1", title: "Foldkit" }))),
})

const router = createRouter({ routeTree: route })

export const commitSource = Result.getOrThrow(TanStack.make(router, [declaration]))
```

## react-foldkit/modelSource

### ModelReader

Read-only external-store contract consumed by React Model hooks. Implement it to supply
cached live and hydration snapshots without exposing Message dispatch.

Live and server snapshots must retain their identity until their data changes.

- `getSnapshot` Reads the current cached Model without acquiring resources or notifying observers.

  ```ts
  () => Model
  ```

- `getServerSnapshot` Reads the Model used during server rendering and hydration.

  ```ts
  () => Model
  ```

- `subscribe` Registers synchronous invalidation and returns cleanup. Notifications tell React to read
  the snapshot again.

  ```ts
  (notify: () => void) => () => void
  ```

### ModelSource

Model snapshots and a dispatcher to their owner. Use this contract to let views read a
Model and send Messages without depending on the Store implementation.

- `dispatch` Sends a Message to the owner of these snapshots.

  ```ts
  (message: Message) => void
  ```

- `getSnapshot` Reads the current cached Model without acquiring resources or notifying observers.

  ```ts
  () => Model
  ```

- `getServerSnapshot` Reads the Model used during server rendering and hydration.

  ```ts
  () => Model
  ```

- `subscribe` Registers synchronous invalidation and returns cleanup. Notifications tell React to read
  the snapshot again.

  ```ts
  (notify: () => void) => () => void
  ```
