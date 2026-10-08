# React Foldkit

React bindings for Foldkit's Elm Architecture. Keep application state and transitions outside React components while using Effect for side effects and resource cleanup.

A Model describes state. A Message describes an event. The pure `update` function returns the next Model and any Commands to run. An application Provider owns that program, and its hooks connect React views to it.

## Create an application

This package currently uses the local Foldkit fork described in the [workspace setup](../../README.md#run-locally).

```tsx
import { Schema } from "effect"
import { defineMessageUnion } from "react-foldkit/message"
import { defineApplication } from "react-foldkit/react"
import { modifyFields } from "react-foldkit/struct"
import type * as Update from "react-foldkit/update"

const Model = Schema.Struct({ count: Schema.Number })
type Model = typeof Model.Type

const Message = defineMessageUnion({ ClickedIncrement: {} })
type Message = typeof Message.Type

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedIncrement: () => ({ model: modifyFields(model, { count: (count) => count + 1 }) }),
  })

const Counter = defineApplication({ Model, update })

function CounterView() {
  const count = Counter.useModel((model) => model.count)
  const dispatch = Counter.useDispatch()
  return <button onClick={() => dispatch(Message.ClickedIncrement())}>{count}</button>
}

export function App() {
  return (
    <Counter.Provider init={{ model: { count: 0 } }}>
      <CounterView />
    </Counter.Provider>
  )
}
```

The `Model` Schema supplies type inference. The Provider does not validate Model values with it. Keep updates pure and snapshots immutable.

## Read next

- [Build a counter with Commands](docs/examples.md) for a step-by-step tutorial.
- [Public API reference](docs/reference.md) for imports and contracts.
- [Runtime architecture](docs/architecture.md) for lifecycle, child Models, and external data.
- [Project-cache example](examples/projectCache/README.md) for Query and TanStack composition.
- [ESLint presets](eslint/README.md) for architecture rules.

Import Query from `foldkit/experimental/query`. Other Foldkit helpers are available through `react-foldkit` namespaces and subpaths. The optional `react-foldkit/tanstack` adapter requires the TanStack peer dependencies listed in `package.json`.
