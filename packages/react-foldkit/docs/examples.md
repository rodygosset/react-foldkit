# Build a counter with Commands

We'll build a counter, then add a button that increments it after one second. The delay runs as an Effect Command, so the React view never runs side effects. It only reads state and sends Messages.

Use a React application with the [required packages](../README.md#install).

## Create the counter

Create `App.tsx` with the following code. Render its `App` component from your React entry point.

```tsx
import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import * as Application from "react-foldkit/application"
import { modifyFields } from "foldkit/struct"
import type * as Update from "foldkit/update"

const Model = Schema.Struct({ count: Schema.Finite })
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

const Counter = Application.define({ Model, Message, update })

function CounterView() {
  const count = Counter.useModel((model) => model.count)
  const send = Counter.useSend()

  return (
    <div>
      <output>{count}</output>
      <button onClick={() => send.ClickedDecrement()}>Decrement</button>
      <button onClick={() => send.ClickedIncrement()}>Increment</button>
      <button onClick={() => send.ClickedReset()}>Reset</button>
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

`Model` defines the shape of the state. `Message` lists the events `update` handles. `Counter.Provider` owns the state, and `CounterView` reads it with `useModel`. The view never changes the Model itself.

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
  count: Schema.Finite,
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

const Counter = Application.define(
  { Model, Message, update },
  {
    restartInterrupted: (command) => command.name === "WaitToIncrement",
  }
)
```

Change the Provider's initial Model to `{ count: 0, isWaiting: false }`.

`ClickedDelayedIncrement` sets `isWaiting` and returns a Command. When the delay finishes, the Command sends `CompletedDelay`, and `update` increments the count and clears `isWaiting`.

## Show the pending state

Replace `CounterView` with this version.

```tsx
function CounterView() {
  const count = Counter.useModel((model) => model.count)
  const isWaiting = Counter.useModel((model) => model.isWaiting)
  const send = Counter.useSend()

  return (
    <div>
      <output>{count}</output>
      <button onClick={() => send.ClickedDecrement()}>Decrement</button>
      <button onClick={() => send.ClickedIncrement()}>Increment</button>
      <button onClick={() => send.ClickedReset()}>Reset</button>
      <button
        disabled={isWaiting}
        onClick={() => send.ClickedDelayedIncrement()}
      >
        {isWaiting ? "Waiting..." : "Increment after one second"}
      </button>
    </div>
  )
}
```

Click **Increment after one second**. The button shows **Waiting...** and becomes disabled. After one second, the count increases and the button becomes available again.

The other buttons still work during the delay. **Reset** changes the count but doesn't cancel the pending increment. Removing the Provider stops all its live work, including the delay.

React Activity also stops the delay when it hides the Provider, but it keeps the Model. When Activity shows the Provider again, there are three ways to handle the stopped delay:

| Option | What happens |
| --- | --- |
| `restartInterrupted` | Starts the delay again, so `isWaiting` still ends in an increment. Use it only for work that is safe to repeat. |
| `onReactivate` | Receives the stopped Commands and returns a Message for `update`, for work you shouldn't repeat. |
| `retainInactive` | Keeps the delay running through short hides, so nothing stops. |

The view now handles an asynchronous interaction without running any Effects. The Model records that a delay is pending, and `update` handles both the click and the completion.

## Follow a changing prop

The Provider reads `init` only once. When a value from outside the app keeps changing, such as a route search parameter, send each change to `update`. Don't remount the Provider for it, because remounting throws away the Model and restarts its Commands.

```tsx
const Message = defineMessageUnion({ ChangedStep: { step: Schema.Finite } })

function SyncStep({ step }: { readonly step: number }) {
  Counter.useInbound(step, (step) => Message.ChangedStep({ step }))
  return null
}
```

Render `SyncStep` inside the Provider. `useInbound` skips the first value, since `init` already has it, and sends a Message only when `Equal.equals` says the value changed.

## Recover from a crash

When a Command or `update` fails, the Store crashes, and the Provider renders `crash.view` instead of its children. The view receives the failure, the Model at that moment, the Message that caused it, and `restart`, which remounts the Provider from `init`.

```tsx
const Counter = Application.define(
  { Model, Message, update },
  {
    crash: {
      view: ({ cause, restart }) => (
        <div role="alert">
          <pre>{Cause.pretty(cause)}</pre>
          <button onClick={restart}>Start again</button>
        </div>
      ),
      report: ({ cause, message }) => Effect.logError("Counter crashed", message, cause),
    },
  }
)
```

A Provider's `crash` prop replaces either callback for that one Provider.

Next, read about [child Models](https://github.com/rodygosset/react-foldkit/blob/v0.1.0/README.md#give-a-todo-form-its-own-submodel) and the [project-cache example](https://github.com/rodygosset/react-foldkit/tree/v0.1.0/packages/react-foldkit/examples/projectCache). [How the runtime works](architecture.md) explains ownership and cleanup.
