# React Foldkit

React Foldkit runs [Foldkit](https://foldkit.dev) programs inside React. Your app's state and the rules that change it live outside your components, and Effect runs the side effects and cleans up their resources.

> React Foldkit is experimental. A minor release may break your code. The [changelog](CHANGELOG.md) lists each change and how to upgrade.

Patch releases fix bugs without breaking anything. Minor releases add features.

## How it works

- The **Model** is your app's state.
- A **Message** describes something that happened, such as a click.
- The pure `update` function takes the Model and a Message. It returns the next Model and any Commands, which are the side effects to run.
- An application **Provider** runs this loop. Its hooks let React components read the Model and send Messages.

## Install

Install React Foldkit with its peer dependencies:

```sh
npm install react-foldkit foldkit@^0.169.0 effect@4.0.0 react@^19.2.6
```

You need:

- React `^19.2.6`, Foldkit `^0.169.0`, and Effect `4.0.0`.
- An ESM bundler for browser apps, and Node.js `20.19.0` or newer for server rendering.
- TypeScript with `strict: true` and `moduleResolution: "bundler"`. The package is tested with TypeScript `7.0.2`.
- ESLint 9, only if you use `react-foldkit/eslint`.

The package is ESM-only. A browser app also needs a renderer, usually `react-dom`.

## Build a counter

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

Each click sends `ClickedIncrement`. `update` returns a Model with a higher count, and the button shows it.

The `Model` Schema gives TypeScript the Model's type. In development, the Provider also checks the starting Model against the Schema and freezes every Model it publishes, so code that mutates a Model throws right away.

## Import Foldkit from Foldkit

Import Foldkit's own pieces, such as Messages, Commands, `Update`, `AsyncData`, and Query, from `foldkit`. It is a peer dependency, so your app and React Foldkit share one copy. `react-foldkit` exports only what it adds: the React bindings, the Store, Programs, and Submodels.

The one exception is `react-foldkit/scene`. It mirrors `foldkit/scene`, so a Scene test moves to Foldkit by changing one import.

## Read next

| Guide | What it covers |
| --- | --- |
| [Build a counter with Commands](docs/examples.md) | A step-by-step tutorial |
| [Move to Foldkit](docs/moveToFoldkit.md) | What stays the same and what you rewrite when a feature leaves React |
| [Use a router](docs/routing.md) | Keep the URL and the Model in sync |
| [Managed Resources](docs/managedResources.md) | Resources that exist only while the Model needs them |
| [Test views with Scene](docs/scene.md) | Foldkit Scene tests for React views |
| [Debug with Foldkit DevTools](docs/devtools.md) | Message history, time travel, and the MCP server |
| [API reference](docs/reference.md) | Every import and what it guarantees |
| [How the runtime works](docs/architecture.md) | Lifecycle, child Models, and async data |
| [Project-cache example](https://github.com/rodygosset/react-foldkit/tree/v0.1.0/packages/react-foldkit/examples/projectCache) | A keyed Query loaded from TanStack routes |
| [ESLint presets](eslint/README.md) | Lint rules that keep app code in this architecture |
| [Agent guide](AGENTS.md) | Rules for AI agents writing app code |
