# Build a counter with Commands

We'll build a counter, then add a button that increments it after one second. The delay runs as an Effect Command, so the React view only reads state and sends Messages.

Use a React application with `react-foldkit` and Effect available. Follow the [workspace setup](../../../README.md#run-locally) if you are working in this repository.

## Create the counter

Create `App.tsx` with the following code. Render its `App` component from your React entry point.

```tsx
import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import { defineApplication } from "react-foldkit/react"
import { modifyFields } from "foldkit/struct"
import type * as Update from "foldkit/update"

const Model = Schema.Struct({ count: Schema.Number })
type Model = typeof Model.Type

const Message = defineMessageUnion({
  ClickedDecrement: {},
  ClickedIncrement: {},
  ClickedReset: {},
})
type Message = typeof Message.Type

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedDecrement: () => ({
      model: modifyFields(model, { count: (count) => count - 1 }),
    }),
    ClickedIncrement: () => ({
      model: modifyFields(model, { count: (count) => count + 1 }),
    }),
    ClickedReset: () => ({ model: modifyFields(model, { count: () => 0 }) }),
  })

const Counter = defineApplication({ Model, update })

function CounterView() {
  const count = Counter.useModel((model) => model.count)
  const dispatch = Counter.useDispatch()

  return (
    <div>
      <output>{count}</output>
      <button onClick={() => dispatch(Message.ClickedDecrement())}>Decrement</button>
      <button onClick={() => dispatch(Message.ClickedIncrement())}>Increment</button>
      <button onClick={() => dispatch(Message.ClickedReset())}>Reset</button>
    </div>
  )
}

export function App() {
  return (
    <Counter.Provider init={{ model: { count: 0 } }}>
      <CounterView />
    </Counter.Provider>
  )
}
```

You should see `0`. Click **Increment** to see `1`, then **Reset** to return to `0`.

`Model` defines the state type. `Message` names the events that update handles. `Counter.Provider` owns the state, and `CounterView` reads it through `useModel`. The view does not mutate the Model.

## Describe the delayed increment

We'll track the pending delay in the Model so the view can disable the button while it waits.

Replace the import from `effect` and add the Command import.

```ts
import { Effect, Schema } from "effect"
import * as Command from "foldkit/command"
```

Replace the Model, Message, update, and `Counter` declarations with the following code. Keep the existing imports, `CounterView`, and `App`.

```ts
const Model = Schema.Struct({
  count: Schema.Number,
  isWaiting: Schema.Boolean,
})
type Model = typeof Model.Type

const Message = defineMessageUnion({
  ClickedDecrement: {},
  ClickedIncrement: {},
  ClickedReset: {},
  ClickedDelayedIncrement: {},
  CompletedDelay: {},
})
type Message = typeof Message.Type

const WaitToIncrement = Command.define("WaitToIncrement", {
  messages: [Message.CompletedDelay],
  execute: Effect.as(Effect.sleep("1 second"), Message.CompletedDelay()),
})

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedDecrement: () => ({
      model: modifyFields(model, { count: (count) => count - 1 }),
    }),
    ClickedIncrement: () => ({
      model: modifyFields(model, { count: (count) => count + 1 }),
    }),
    ClickedReset: () => ({ model: modifyFields(model, { count: () => 0 }) }),
    ClickedDelayedIncrement: () =>
      model.isWaiting
        ? { model }
        : { model: modifyFields(model, { isWaiting: () => true }), commands: [WaitToIncrement()] },
    CompletedDelay: () => ({
      model: modifyFields(model, { count: (count) => count + 1, isWaiting: () => false }),
    }),
  })

const Counter = defineApplication({
  Model,
  update,
  restartInterrupted: (command) => command.name === "WaitToIncrement",
})
```

Change the Provider's initial Model to `{ count: 0, isWaiting: false }`.

`ClickedDelayedIncrement` changes the Model and returns a Command. When the delay finishes, the Command sends `CompletedDelay`. Update then increments the current count and clears `isWaiting`.

## Show the pending state

Replace `CounterView` with this version.

```tsx
function CounterView() {
  const count = Counter.useModel((model) => model.count)
  const isWaiting = Counter.useModel((model) => model.isWaiting)
  const dispatch = Counter.useDispatch()

  return (
    <div>
      <output>{count}</output>
      <button onClick={() => dispatch(Message.ClickedDecrement())}>Decrement</button>
      <button onClick={() => dispatch(Message.ClickedIncrement())}>Increment</button>
      <button onClick={() => dispatch(Message.ClickedReset())}>Reset</button>
      <button
        disabled={isWaiting}
        onClick={() => dispatch(Message.ClickedDelayedIncrement())}
      >
        {isWaiting ? "Waiting..." : "Increment after one second"}
      </button>
    </div>
  )
}
```

Click **Increment after one second**. The button shows **Waiting...** and becomes disabled. After one second, the count increases and the button becomes available again.

Other buttons still work during the delay. **Reset** changes the count but does not cancel the pending increment. Removing the application Provider stops its live work, including the delay.

React Activity also stops the delay when it hides the Provider, but retains the Model. `restartInterrupted` starts the delay again when Activity shows the Provider, so `isWaiting` still ends with an increment. Only restart work that is safe to repeat. For anything else, `onReactivate` receives the interrupted Commands and returns a Message for update. To keep the delay running through short hides instead, set `retainInactive`.

The view now handles an asynchronous interaction without running Effects itself. The Model records the pending state, and update handles both the click and completion.

## Follow a changing prop

The Provider reads `init` once. When a value from outside the application keeps changing, such as a route search parameter, send each change to update instead of remounting the Provider. Remounting would discard the Model and restart its Commands.

```tsx
const Message = defineMessageUnion({ ChangedStep: { step: Schema.Number } })

function SyncStep({ step }: { readonly step: number }) {
  Counter.useInbound(step, (step) => Message.ChangedStep({ step }))
  return null
}
```

Render `SyncStep` inside the Provider. `useInbound` skips the first value, which `init` already contains, and compares later values with `Equal.equals`.

## Recover from a crash

A Command or update that fails crashes the Store. The Provider then renders `crash.view` in place of its children. The view receives the failure, the Model at the time, the Message that triggered it, and `restart`, which remounts the Provider from `init`.

```tsx
const Counter = defineApplication({
  Model,
  update,
  crash: {
    view: ({ cause, restart }) => (
      <div role="alert">
        <pre>{Cause.pretty(cause)}</pre>
        <button onClick={restart}>Start again</button>
      </div>
    ),
    report: ({ cause, message }) => Effect.logError("Counter crashed", message, cause),
  },
})
```

A Provider's `crash` prop overrides either callback for that Provider.

For child Models and route-loaded data, continue with the [project-cache example](../examples/projectCache/README.md). See [how the runtime works](architecture.md) for ownership and cancellation.
