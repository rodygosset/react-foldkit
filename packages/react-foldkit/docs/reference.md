# Public API reference

Generated from the public exports. See the [counter tutorial](examples.md) for usage and [runtime architecture](architecture.md) for ownership. Regenerate with `bun run --filter=react-foldkit docs:generate` from the repository root.

- [react-foldkit](#react-foldkit)
- [react-foldkit/application](#react-foldkitapplication)
- [react-foldkit/store](#react-foldkitstore)
- [react-foldkit/submodel](#react-foldkitsubmodel)
- [react-foldkit/program](#react-foldkitprogram)
- [react-foldkit/devtools](#react-foldkitdevtools)
- [react-foldkit/vite](#react-foldkitvite)
- [react-foldkit/eslint](#react-foldkiteslint)
- [react-foldkit/modelSource](#react-foldkitmodelSource)
- [react-foldkit/scene](#react-foldkitscene)
- [react-foldkit/scene/react](#react-foldkitscenereact)

## react-foldkit

### Application

Application Providers and Model hooks for running a Program in React.

### ModelSource

Model snapshots, subscriptions, and dispatch contracts shared by React bindings.

### Program

Foldkit applications and child features without their views, shared by React, Stores, and tests.

### Store

Scoped Model ownership, Message delivery, and lifecycle errors.

### Submodel

Child Model Providers, hooks, and lifts.

## react-foldkit/application

### Application

The Provider and hooks returned by `define` for a Foldkit application.
Render its Provider above the views that use its hooks. Each mounted Provider owns an
independent Model and the Commands and Subscriptions that update it.

- `Provider` Provides application state to its children and owns Commands and Subscriptions while active.
  Captures `init` on initialization. Remount to replace it.

  ```ts
  (props: ProviderProps<Model, Message, R, HasInit>) => React.ReactNode
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

- `useSend` Returns a Send for the Provider's Message union. Call `send.Tag(fields)` to build and
  dispatch a Message, or `send(message)` to dispatch one you built. Its identity is stable
  while the Provider's source is. Throws outside the matching Provider.

  ```ts
  () => Send<Message>
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
  <ChildModel, ChildMessage>(projection: Projection<Model, Message, ChildModel, ChildMessage>) => ModelSource<ChildModel, ChildMessage>
  ```

- `useOptionalSubmodel` Returns `None` while the child Model is absent. A previously created source retains its
  last Model while absent and resumes when the child returns. Throws outside the matching
  parent Provider.

  ```ts
  <ChildModel, ChildMessage>(projection: OptionalProjection<Model, Message, ChildModel, ChildMessage>) => Option.Option<ModelSource<ChildModel, ChildMessage>>
  ```

### CrashConfig

How an application shows and reports failures. Mirrors Foldkit's crash configuration.
Set it in the options of `define`, and override either callback on a Provider.

- `view` Renders in place of the Provider's children. Call `restart` to remount the Provider with
  a fresh Store from `init`. The default view shows a typed failure's message, or a generic
  message for defects.

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
  such as an initial Model that failed `validateInit`.

  ```ts
  Option.Option<Model>
  ```

- `message` The Message whose update or Command crashed the Store. `None` for other failures, such as
  Subscriptions, init Commands, or resource cleanup.

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

- `useSend` Returns a Send for the Provider's Message union. Call `send.Tag(fields)` to build and
  dispatch a Message, or `send(message)` to dispatch one you built. Its identity is stable
  while the Provider's source is. Throws outside the matching Provider.

  ```ts
  () => Send<Message>
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
  <ChildModel, ChildMessage>(projection: Projection<Model, Message, ChildModel, ChildMessage>) => ModelSource<ChildModel, ChildMessage>
  ```

- `useOptionalSubmodel` Returns `None` while the child Model is absent. A previously created source retains its
  last Model while absent and resumes when the child returns. Throws outside the matching
  parent Provider.

  ```ts
  <ChildModel, ChildMessage>(projection: OptionalProjection<Model, Message, ChildModel, ChildMessage>) => Option.Option<ModelSource<ChildModel, ChildMessage>>
  ```

### Options

How an application runs its Program in React: the services its Commands and Subscriptions
need, its failure handling, and its activation behavior. Pass it to `define` after the
Program.

The `resources` Layer must require no additional services and have no typed failures. It is
required when the Program needs services not supplied by its Managed Resources. That also
makes the options argument required.

- `onReactivate` Creates a Message when the Provider reactivates with a replacement Store. Use it to retry
  interrupted work or clear pending state. It is not called on the initial activation or when
  `retainInactive` kept the previous Store running.

  ```ts
  ReactStore.Config<Model, Message, R, MessageSchema, Managed>["onReactivate"] | undefined
  ```

- `retainInactive` Keeps the Store, its Layer, Managed Resources, Commands, and Subscriptions running for this
  long after the last activation ends. Reactivating within the window resumes the same Store without
  interrupting anything. Defaults to zero, which disposes the Store on deactivation.
  
  Work started before an unmount can still finish during the window, so keep it short when
  Commands perform writes or navigation.

  ```ts
  ReactStore.Config<Model, Message, R, MessageSchema, Managed>["retainInactive"] | undefined
  ```

- `restartInterrupted` Starts Commands interrupted by deactivation again when a replacement Store activates. Pass
  `true` for all of them or a predicate to choose. Restart only idempotent work, such as
  Query fetches: an interrupted write may already have reached its server.

  ```ts
  ReactStore.Config<Model, Message, R, MessageSchema, Managed>["restartInterrupted"] | undefined
  ```

- `freezeModel` Freezes every Model the Provider publishes so accidental mutation throws where it happens.
  Plain objects and arrays are frozen; Effect values and class instances are not. Defaults to
  `true` outside production builds.

  ```ts
  ReactStore.Config<Model, Message, R, MessageSchema, Managed>["freezeModel"] | undefined
  ```

- `onCrash` Called once on terminal failure, with the original Cause and a Message when one triggered
  the failure. Runs before `subscribeCrash` listeners. Observer defects are logged.

  ```ts
  ReactStore.Config<Model, Message, R, MessageSchema, Managed>["onCrash"] | undefined
  ```

- `resources` Supplies services not provided by Managed Resources. Live work finishes before the Layer
  releases its resources.

  ```ts
  ReactStore.Config<Model, Message, R, MessageSchema, Managed>["resources"] | undefined
  ```

- `crash` Default failure view and reporting for every Provider of this application.

  ```ts
  CrashConfig<Model, Message> | undefined
  ```

- `validateInit` Checks the initial Model against the Program's `Model`. A mismatch fails the Provider with
  a `SchemaError`. Defaults to `true` outside production builds.

  ```ts
  boolean | undefined
  ```

- `devTools` Foldkit's DevTools settings, the same `DevToolsConfig` Foldkit's runtime takes. Add
  `devTools()` from `react-foldkit/vite` to show Foldkit's panel and connect its MCP relay.
  
  Each Provider records its own history. With several Providers on a page, a selector chooses
  which one the panel shows. Selecting a history entry in `"TimeTravel"` mode renders that
  entry's Model while Commands and Subscriptions keep running on the live Model, and drops
  Messages sent from the paused view. Resume renders the latest live Model. React Foldkit
  records no Mounts, so the panel's Mounts tab stays empty.

  ```ts
  ReactStore.Config<Model, Message, R, MessageSchema, Managed>["devTools"] | undefined
  ```

### ProviderProps

Props for the application Provider that supplies the Model and Message handlers to its views.
`init` supplies the initial Model and Commands, and `crash` overrides how this Provider shows
and reports failures. `init` is optional when the Program has an `init`, and
replaces it when passed.

The Provider captures `init` on initialization. Changing it later does not replace it.
Children and crash callbacks follow subsequent renders. Use `useInbound` to send later prop
changes to update.

- `children`

  ```ts
  React.ReactNode
  ```

- `crash` Overrides the application's crash view or report for this Provider.

  ```ts
  CrashConfig<Model, Message> | undefined
  ```

- `init`

  ```ts
  Init<Model, Message, R> | undefined
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

### SceneSourceTypeId

Identifies the React context an Application uses so Scene can render its hooks.

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

### Send

Sends Messages by tag. `send.ChangedTitle({ title })` builds the Message with the union's
constructor and dispatches it. `send(message)` dispatches a Message you already built.

### define

Creates a React Provider and hooks for a Foldkit Program.
Define the application once, then render its Provider. Views read state with `useModel` and
send Messages with `useSend`. The second argument holds React-only options and the
`resources` that supply the Program's services.

**Details**

The Provider renders the initial Model during render, including SSR. Commands and
Subscriptions start when React activates the Provider. Deactivation stops them and retains the Model for reactivation, unless `retainInactive`
keeps the Store running for a while.

Completed init Commands do not run again after reactivation. Interrupted init Commands
restart. Interrupted update Commands restart when `restartInterrupted` selects them, and the
rest reach `onReactivate`.

**Gotchas**

React may repeat or abandon initialization. Keep update and `init` functions pure.
Remount the Provider to replace `init`, or use `useInbound` to send changing values to update.
When the Program has an `init`, a Provider's `init` prop replaces it for that Provider.

**Example** (Connecting a counter to React)

```tsx
import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import * as Application from "react-foldkit/application"
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

const Counter = Application.define({ Model, Message, update })

function View() {
  const count = Counter.useModel((model) => model.count)
  const send = Counter.useSend()

  return <button onClick={() => send.ClickedIncrement()}>{count}</button>
}

export function App() {
  return (
    <Counter.Provider init={{ model: { count: 0 } }}>
      <View />
    </Counter.Provider>
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
when Managed Resources supply all services or the Program requires none. The Store builds
it when live work first needs it.

- `update` Applies a Message to the Model without running side effects. Return Commands for work that
  runs after the transition.

  ```ts
  (model: Model, message: Message) => Readonly<{ model: Model; commands?: Update.Commands<Message, R> | undefined; outMessage?: never; }>
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

- `managedResources` Resources whose lifetime follows the Model. Use Foldkit's `ManagedResource.make` to declare
  acquisition, release, and lifecycle Messages. Each activation owns separate live values.
  A record supplies its services only when it is present and its keys are known.

  ```ts
  StoreResources<Model, Message, Managed> | ((StoreResources<Model, Message, Managed> | undefined) & NoInfer<StoreResources<Model, Message, Managed>>) | undefined
  ```

- `resources` Supplies services not provided by Managed Resources. Live work finishes before the Layer
  releases its resources.

  ```ts
  Layer.Layer<never, never, never> | Layer.Layer<NoInfer<RemainingServices<R, Managed>>, never, never> | undefined
  ```

### Crashed

The failure returned by `takeWhen` when its Store has crashed.
`cause` is the original crash Cause, with its annotations preserved.

### Disposed

The failure returned by `takeWhen` when its Store has been disposed.

### Inactive

The `CommitError` reason when React has deactivated the Provider that owns the Store.

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

- `managedResources` Resources whose lifetime follows the Model. Use Foldkit's `ManagedResource.make` to declare
  acquisition, release, and lifecycle Messages. Each activation owns separate live values.
  A record supplies its services only when it is present and its keys are known.

  ```ts
  StoreResources<Model, Message, Managed> | ((StoreResources<Model, Message, Managed> | undefined) & NoInfer<StoreResources<Model, Message, Managed>>) | undefined
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
changes and checks again. It removes its listeners on completion or interruption. When a
later Model matches, the Effect continues after the Store finishes delivering the Message
that produced it, so the caller can `commit` right away.

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

### Config

The child Model Schema and Message union that `define` binds. A child `Program` from
`Program.make` is one.

- `Model` Supplies the child Model type. The Submodel Provider does not validate it.

  ```ts
  ModelSchema
  ```

- `Message` The Schema of the Messages the child update handles, usually the union from
  `defineMessageUnion`. `useSend` builds Messages with its constructors.

  ```ts
  MessageSchema
  ```

### Lift

A child stored in one field of its parent Model, described once for both halves of the
Submodel. Pass it to a Submodel Provider or `useSubmodel`, and call `fold` from the parent
update to run the child update and write the result back.

- `field` The parent field that holds the child Model.

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

### OptionalProjection

How `useOptionalSubmodel` reads a child that may be absent from a parent Model, exposing a
child source while the child exists.

- `read` Returns the current child Model or `None`. Keep this function pure and stable across renders.

  ```ts
  (model: ParentModel) => Option.Option<Model>
  ```

- `toParentMessage` Converts a child Message into the Message handled by the parent update.

  ```ts
  (message: Message) => ParentMessage
  ```

### Projection

How a child Provider or `useSubmodel` reads a child that is always present in a parent Model
and routes its Messages back. A `Lift` is one; a plain object with the same two fields works
for any other read.

- `read` Projects a child Model. Keep this function pure and its declaration stable across renders.

  ```ts
  (model: ParentModel) => Model
  ```

- `toParentMessage` Converts a child Message into the Message handled by the parent update.

  ```ts
  (message: Message) => ParentMessage
  ```

### ProviderError

Thrown when a required Submodel hook is called outside its matching Provider.

### ProviderProps

Props for a Submodel Provider. Pass the parent hooks and a lift to derive the child source,
the parent hooks and an `optionalLift` for a child that may be absent, or a source you
already derived.

- `children`

  ```ts
  React.ReactNode
  ```

- `from` The parent application or Submodel whose Model holds this child.
  The parent application or Submodel whose Model may hold this child.

  ```ts
  Pick<ModelHooks<ParentModel, ParentMessage>, "useSubmodel"> | Pick<ModelHooks<ParentModel, ParentMessage>, "useOptionalSubmodel"> | undefined
  ```

- `lift` Reads the child from the parent Model and lifts its Messages. Declare it outside render.

  ```ts
  Projection<ParentModel, ParentMessage, Model, Message> | undefined
  ```

- `optionalLift` Reads the child while the parent Model holds it and lifts its Messages. Declare it
  outside render.

  ```ts
  OptionalProjection<ParentModel, ParentMessage, Model, Message> | undefined
  ```

- `fallback` Rendered in place of the children while the child is absent. Defaults to nothing.

  ```ts
  React.ReactNode
  ```

- `source` A child source derived with `useSubmodel` or `useOptionalSubmodel`.

  ```ts
  ModelSource<Model, Message> | undefined
  ```

### Submodel

React binding for a child Model owned by its parent, returned by `define`. Use
its Provider to give child views a lifted source without starting another Store.

- `Provider` Supplies the parent-owned child to child hooks, from a parent and lift or optional lift, or
  from a source. It does not acquire services or start Commands.

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

- `useSend` Returns a Send for the Provider's Message union. Call `send.Tag(fields)` to build and
  dispatch a Message, or `send(message)` to dispatch one you built. Its identity is stable
  while the Provider's source is. Throws outside the matching Provider.

  ```ts
  () => Send<Message>
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
  <ChildModel, ChildMessage>(projection: Projection<Model, Message, ChildModel, ChildMessage>) => ModelSource<ChildModel, ChildMessage>
  ```

- `useOptionalSubmodel` Returns `None` while the child Model is absent. A previously created source retains its
  last Model while absent and resumes when the child returns. Throws outside the matching
  parent Provider.

  ```ts
  <ChildModel, ChildMessage>(projection: OptionalProjection<Model, Message, ChildModel, ChildMessage>) => Option.Option<ModelSource<ChildModel, ChildMessage>>
  ```

### define

Creates a child Provider and hooks for a parent-owned Model source.

The Provider reads the child from a parent with `from` and `lift`, from a parent with `from`
and `optionalLift` while the child is present, or takes a `source` you already derived, and
forwards its snapshots and Messages. It does not create a Store, acquire services, or start
Commands. Required hooks throw `ProviderError` outside this Provider; optional hooks return
`None`.

**Example** (Sharing a parent-owned counter with a child view)

```tsx
import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import * as Submodel from "react-foldkit/submodel"

export const Model = Schema.Struct({ count: Schema.Finite })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({ Incremented: {} })
export type Message = typeof Message.Type

export const { Provider, useModel, useSend } = Submodel.define({ Model, Message })

export function View() {
  const count = useModel((model) => model.count)
  const send = useSend()

  return <button onClick={() => send.Incremented()}>{count}</button>
}
```

### lift

Lifts a child stored in one field of the parent Model. The result reads and writes that
field, lifts child Messages, and folds the child update, so the view and update halves share
one declaration. Supply the parent Model type in the first call and the options in the second.

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

export const form = Submodel.lift<Model>()({
  field: "form",
  update: Form.update,
  toParentMessage: (message: Form.Message) => Message.GotFormMessage({ message }),
})

export const update = (model: Model, message: Message) =>
  Message.match(message, { GotFormMessage: ({ message }) => form.fold(model, message) })
```

## react-foldkit/program

### Program

A Foldkit application or child feature without its view: the Model Schema, Message union,
update, and optionally an OutMessage union, `init`, Subscriptions, and Managed Resources.
The field names match Foldkit's `Runtime.makeApplication`.

**When to use**

Use a Program to keep a feature's logic in a module without React. Pass an application
Program to `Application.define`, with React-only options and `resources` as its second
argument. Pass a child Program to `Submodel.define`, run `update` in Foldkit Story tests, or
pass the Program to `Store.make` and `Store.boot`.

**Details**

`R` is the services that Commands and Subscriptions require. A Managed Resource record supplies
its own services when the Program includes that record and the record's keys are known. The host
supplies every other service through `resources`. An application Program has no OutMessage, so
its update returns `Update.Return`.

- `OutMessage` The union of facts a child reports to its parent. Omit it for an application.

  ```ts
  Schema.Schema<OutMessage> | undefined
  ```

- `Model` Supplies the Model type. `Application.define` also checks initial Models against it.

  ```ts
  ModelSchema
  ```

- `Message` The Schema of the Messages update handles. Every Message has a string `_tag`.
  Use `defineMessageUnion` to define the variants and their constructors.

  ```ts
  MessageSchema
  ```

- `init` Creates the initial Model and Commands. A child Program usually omits it, because its
  parent creates the child Model.

  ```ts
  (() => Readonly<{ model: ModelSchema["Type"]; commands?: Update.Commands<MessageSchema["Type"], R> | undefined; outMessage?: never; }>) | undefined
  ```

- `update` Applies a Message to the Model without running side effects. Return Commands for work that
  runs after the transition.

  ```ts
  (model: ModelSchema["Type"], message: MessageSchema["Type"]) => Readonly<{ model: ModelSchema["Type"]; commands?: Update.Commands<MessageSchema["Type"], R> | undefined; outMessage?: OutMessage | undefined; }>
  ```

- `subscriptions` Declares Streams whose dependencies are derived from the Model. Changed dependencies
  restart their Streams.

  ```ts
  Readonly<Record<string, Subscription.Subscription<ModelSchema["Type"], MessageSchema["Type"], any, R>>> | undefined
  ```

- `managedResources` Resources whose lifetime follows the Model. Declare them with Foldkit's `ManagedResource.make`.
  A record supplies its services when it is present and its keys are known. A missing record, a
  record that may be absent, or a string-keyed dictionary does not. The host supplies those
  remaining services and releases registered resources on shutdown. Each activation owns separate
  live values. Lift a child's resources with `ManagedResource.lift`.

  ```ts
  Managed | (undefined & Managed) | undefined
  ```

### make

Creates a Program from a Model Schema, a Message union, and Foldkit's `update` and `init`
functions. It checks that every part agrees on the Model and Message types and returns its
argument unchanged.

**Details**

When the Program has an `init`, the result keeps it as required, so the Provider of an
application built from it needs no `init` prop.

**Example** (Sharing a counter Program between React and tests)

```ts
import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"
import type * as Update from "foldkit/update"
import * as Program from "react-foldkit/program"

const Model = Schema.Struct({ count: Schema.Finite })
type Model = typeof Model.Type

const Message = defineMessageUnion({ ClickedIncrement: {} })
type Message = typeof Message.Type

const init = (): Update.Return<Model, Message> => ({ model: { count: 0 } })

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedIncrement: () => ({ model: modifyFields(model, { count: (count) => count + 1 }) }),
  })

export const counter = Program.make({ Model, Message, init, update })
```

## react-foldkit/devtools

### __configure

Connects the injected native Foldkit overlay and Vite HMR bridge to Provider recorders.

## react-foldkit/vite

### devTools

Creates the Vite plugin that connects Foldkit's DevTools panel and MCP relay to React Foldkit
Providers.

**When to use**

Add it to `vite.config.ts` next to `@vitejs/plugin-react` when an application sets `devTools`
in `Application.define`'s options. After migrating to Foldkit's runtime, replace it with
`@foldkit/vite-plugin`; the `devTools` settings carry over unchanged.

**Details**

During `vite serve`, the plugin loads the panel from `@foldkit/devtools` in the browser, including
in frameworks that render HTML on the server, and passes the dev server's HMR channel to every
Provider, which shows the panel with `show: "Development"`. It
also starts Foldkit's DevTools MCP relay on a loopback port and publishes its address for the
Foldkit DevTools MCP server. `vite build` includes the panel only when `@foldkit/devtools` is a
production dependency. Unlike `@foldkit/vite-plugin`, it sends no full-page reloads, so React
Fast Refresh keeps working.

**Gotchas**

- Install `@foldkit/devtools` and its peer dependencies. Without it, the plugin does nothing.

**Example** (Add DevTools to a React app)

```ts
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { devTools } from "react-foldkit/vite"

export default defineConfig({
  plugins: [react(), devTools()],
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

## react-foldkit/scene

### all

Creates Foldkit collection locators, with React boolean-attribute handling for `role`.

### beforeInput

Simulates a before-input event with React capture, bubbling, and the original host target.

### blur

Simulates a blur event with React capture, bubbling, and the original host target.

### change

Simulates a value change with React capture, bubbling, and the original host target.

### changeFiles

Simulates a file selection with React capture, bubbling, and the original host target.

### click

Clicks an element with React event targets and checkbox activation in a bound React Scene.

**Details**

Foldkit views use Foldkit's click step. React views preserve the clicked element as `target`
while each handler receives its own element as `currentTarget`. Checkbox and radio change
handlers read the activated value. A canceled click restores the previous checked state.

### contextMenu

Simulates a context-menu event with React capture, bubbling, and the original host target.

### doubleClick

Simulates a double-click with React capture, bubbling, and the original host target.

### dropFiles

Simulates a file drop with React capture, bubbling, and the original host target.

### focus

Simulates a focus event with React capture, bubbling, and the original host target.

### focusEnter

Simulates focus entering a subtree with React capture, bubbling, and the original host target.

### focusLeave

Simulates focus leaving a subtree with React capture, bubbling, and the original host target.

### getAllByRole

Finds every matching role using React's rendered boolean attributes for bound views.

### getByRole

Finds a role using React's rendered boolean attributes for bound views.
Foldkit views keep Foldkit's own query behavior.

### hover

Simulates mouseover followed by parent-first mouseenter handlers for a React view.

### inside

Runs steps with locators scoped to a parent element, as Foldkit's `inside` does.

**Details**

Scenes of bound React views re-enter the copied runner, so scoped steps render the React view.

### keydown

Simulates a key press with React capture, bubbling, and the original host target.

### pointerDown

Simulates a pointer press with React capture, bubbling, and the original host target.

### pointerUp

Simulates a pointer release with React capture, bubbling, and the original host target.

### role

Locates a role with React boolean-attribute handling in bound views.

### scene

Runs Foldkit Scene steps against a Foldkit view or a React view bound with `bindSceneView`.

**Details**

The signature and steps are Foldkit's `scene` from `foldkit/scene`. A Foldkit view runs on Foldkit's
runner. A bound React view runs on a copy of that runner, pinned to the tested Foldkit release, that
renders the component in a private React root and unmounts it when the scene ends or a step throws.

**Gotchas**

- React views produce no Foldkit Mounts or element hooks, so `Mount` steps and `toHaveHook` do not apply.

### submit

Simulates a form submission with React capture, bubbling, and the original host target.

### type

Simulates a typed value with React capture, bubbling, and the original host target.

### typeContentEditable

Simulates a contenteditable input with React capture, bubbling, and the original host target.

Foldkit reexports inherit their upstream contracts. See [Foldkit documentation](https://foldkit.dev) and the original editor JSDoc.

`AnyCommand`, `AnyMount`, `Command`, `CustomElement`, `Locator`, `LocatorAll`, `ManagedResource`, `Mount`, `MountMatcher`, `MountResolver`, `OutMessageStep`, `OutMessagesStep`, `PendingMount`, `Resolver`, `SceneSimulation`, `SceneStep`, `Subscription`, `SubscriptionMessageStep`, `altText`, `attr`, `displayValue`, `expect`, `expectAll`, `expectHandled`, `expectIgnored`, `expectNoOutMessage`, `expectOutMessage`, `expectOutMessages`, `filter`, `find`, `findAll`, `first`, `getAllByAltText`, `getAllByDisplayValue`, `getAllByLabel`, `getAllByPlaceholder`, `getAllByTestId`, `getAllByText`, `getAllByTitle`, `getByAltText`, `getByDisplayValue`, `getByLabel`, `getByPlaceholder`, `getByTestId`, `getByText`, `getByTitle`, `given`, `label`, `last`, `nth`, `placeholder`, `sceneMatchers`, `selector`, `tap`, `testId`, `text`, `textContent`, `title`, `withViewInputs`, `within`.

## react-foldkit/scene/react

### bindSceneView

Binds a React component that reads an Application's hooks to Foldkit's Scene view contract.

**When to use**

Export the result as the feature's `view`, then pass it to `scene` from `react-foldkit/scene`
with the feature's `update`. When the feature moves to a Foldkit view, export that view instead and
change the test import to `foldkit/scene`.

**Details**

Each `scene` call renders the component in a private React root. `useModel` reads the
Scene's current Model and `useSend` records Messages for Scene instead of dispatching them to a
Store. Synchronous React state updates and Effects finish before the next step. Effect Messages
pass through update, and Commands remain pending until the test resolves them. The root unmounts
when the scene finishes or a step throws.

**Gotchas**

- The component must render one host element at its root.
- React views produce no Foldkit Mounts or element hooks, so `Mount` steps and `toHaveHook` do not apply.
- Timers, promises, transitions, and suspended work need an asynchronous test outside Scene.
- Scene fails after 100 renders if Effect Messages do not settle.

**Example** (Bind a feature view for Scene tests)

```tsx
import { bindSceneView } from "react-foldkit/scene/react"
import { App } from "./application"

function Profile() {
  const model = App.useModel()
  const send = App.useSend()
  return <button onClick={() => send.ClickedLoad()}>{model.name}</button>
}

export const view = bindSceneView(App, Profile)
```
