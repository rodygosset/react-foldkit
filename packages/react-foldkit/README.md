# React Foldkit

React bindings for Foldkit's Elm Architecture. Keep application state and transitions outside React components while using Effect for side effects and resource cleanup.

> React Foldkit is experimental. Breaking changes may occur in minor releases. See the [changelog](CHANGELOG.md) for changes and migration steps.

Compatible fixes use patch releases. Features use minor releases.

A Model describes state. A Message describes an event. The pure `update` function returns the next Model and any Commands to run. An application Provider owns that program, and its hooks connect React views to it.

## Install

Install React Foldkit with its peer dependencies:

```sh
npm install react-foldkit foldkit@^0.168.0 effect@4.0.0 react@^19.2.6
```

## Requirements

- React `^19.2.6`, Foldkit `^0.168.0`, and Effect `4.0.0`.
- Node.js `20.19.0` or newer for server rendering. Browser applications need an ESM bundler.
- TypeScript with `strict: true` and `moduleResolution: "bundler"`. Tested with TypeScript `7.0.2`.
- ESLint 9 only when using `react-foldkit/eslint`.

The package is ESM-only. A browser application also needs its renderer, usually `react-dom`.

## Create an application

Render this `App` from your React entry point:

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

function CounterView() {
  const count = Counter.useModel((model) => model.count)
  const send = Counter.useSend()
  return <button onClick={() => send.ClickedIncrement()}>{count}</button>
}

export function App() {
  return (
    <Counter.Provider init={{ model: { count: 0 } }}>
      <CounterView />
    </Counter.Provider>
  )
}
```

The `Model` Schema supplies type inference. Outside production builds, the Provider also checks the initial Model against it and freezes published Models, so accidental mutation throws. Keep updates pure.

## Read next

- [Build a counter with Commands](docs/examples.md) for a step-by-step tutorial.
- [Public API reference](docs/reference.md) for imports and contracts.
- [Runtime architecture](docs/architecture.md) for lifecycle, child Models, and async data.
- [Project-cache example](https://github.com/rodygosset/react-foldkit/tree/v0.1.0/packages/react-foldkit/examples/projectCache) for loading a keyed Query from TanStack routes.
- [ESLint presets](eslint/README.md) for architecture rules.
- [Agent guide](AGENTS.md) for application code.

Import Foldkit vocabulary, such as Messages, Commands, `Update`, `AsyncData`, and Query, from `foldkit` itself; it is a peer dependency, so your application and React Foldkit share one copy. `react-foldkit` exports only what it adds: the React bindings, Store, and Submodels.
