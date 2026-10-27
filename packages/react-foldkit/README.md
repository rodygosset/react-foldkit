# React Foldkit

React Foldkit runs [Foldkit](https://foldkit.dev) programs inside React.

> React Foldkit is experimental. A minor release may break your code. The [changelog](CHANGELOG.md) lists each change and how to upgrade.

Patch releases fix bugs without breaking anything. Minor releases add features.

## What React Foldkit is

Foldkit is a TypeScript framework built on Effect. A Foldkit app is a Program: a Model, Messages, an `update` function, and Commands for side effects. Foldkit's runtime runs the Program and renders its view.

React Foldkit is a second runtime for the same Programs, one that lives inside React. React components read the Program's Model and send it Messages, while the Program itself stays plain Foldkit. That lets an existing React app move to Foldkit one feature at a time:

1. Move a feature's state and side effects into a Foldkit Program. React keeps rendering it through React Foldkit.
2. Repeat for the next feature, while the rest of the app keeps working.
3. When a feature's view should leave React too, run its Program on Foldkit's own runtime. The Program doesn't change.

[Move to Foldkit](docs/moveToFoldkit.md) walks through these steps.

[Limitations](docs/limitations.md) lists what it doesn't do yet.

This documentation covers only what React Foldkit adds. For the Program itself, such as Models, Messages, `update`, and Commands, read [Foldkit's documentation](https://foldkit.dev/core/architecture).

### What the package adds

| Import                                         | What it gives you                                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `react-foldkit/program`                        | `Program.make`, which checks that a Program's parts agree. A Program built with it works in React Foldkit, in Foldkit, and in tests. |
| `react-foldkit/application`                    | `Application.define`, which turns a Program into a React Provider and hooks.                                                         |
| `react-foldkit/submodel`                       | Hooks for a child Program that lives inside a parent's Model.                                                                        |
| `react-foldkit/scene`                          | Foldkit's Scene tests, running on React views.                                                                                       |
| `react-foldkit/store`                          | A Store that runs a Program without React, for Effect code and tests.                                                                |
| `react-foldkit/devtools`, `react-foldkit/vite` | Foldkit's DevTools panel, connected to your Providers.                                                                               |
| `react-foldkit/eslint`                         | Lint rules that keep side effects in Commands, out of React components.                                                              |

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

## Run a Program in React

This counter's Program is a smaller version of [Foldkit's counter example](https://foldkit.dev/core/counter-example). Only `Program.make` and the React part are new.

```tsx
import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"
import type * as Update from "foldkit/update"
import * as Application from "react-foldkit/application"
import * as Program from "react-foldkit/program"

// The Program: plain Foldkit.
const Model = Schema.Struct({ count: Schema.Finite })
type Model = typeof Model.Type

const Message = defineMessageUnion({ ClickedIncrement: {} })
type Message = typeof Message.Type

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedIncrement: () => ({ model: modifyFields(model, { count: (count) => count + 1 }) }),
  })

const init = () => ({ model: { count: 0 } })

const counter = Program.make({ Model, Message, init, update })

// The React part.
const Counter = Application.define(counter)

function CounterButton() {
  const count = Counter.useModel((model) => model.count)
  const send = Counter.useSend()
  return <button onClick={() => send.ClickedIncrement()}>{count}</button>
}

export function App() {
  return (
    <Counter.Provider>
      <CounterButton />
    </Counter.Provider>
  )
}
```

Here is what each React Foldkit piece does:

- `Program.make` returns the Program unchanged. It checks at compile time that the Model, Messages, `init`, and `update` agree.
- `Application.define` returns a `Provider` and hooks for this Program.
- `Counter.Provider` runs the Program. Each mounted Provider has its own Model, and it runs the Program's Commands while it is mounted. [How the Provider runs a Program](docs/provider.md) covers its lifecycle.
- `Counter.useModel` reads part of the Model. The component renders again only when that part changes.
- `Counter.useSend` returns `send`, with one method per Message.

In development, the Provider also checks the starting Model against the `Model` Schema and freezes every Model it publishes, so code that mutates a Model throws right away.

## Import Foldkit from Foldkit

Import Foldkit's own pieces, such as Messages, Commands, `Update`, `AsyncData`, and Query, from `foldkit`. It is a peer dependency, so your app and React Foldkit share one copy. `react-foldkit` exports only what it adds.

The one exception is `react-foldkit/scene`. It mirrors `foldkit/scene`, so a Scene test moves to Foldkit by changing one import.

## Read next

| Guide                                                                                                                       | What it covers                                                                      |
| --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [How the Provider runs a Program](docs/provider.md)                                                                         | When Commands start and stop, React Activity, changing props, services, and crashes |
| [Move to Foldkit](docs/moveToFoldkit.md)                                                                                    | Move an app from React to Foldkit, one feature at a time                            |
| [Give child Programs their own hooks](docs/submodels.md)                                                                    | Foldkit Submodels in React components                                               |
| [Use a router](docs/routing.md)                                                                                             | Keep the URL and the Model in sync                                                  |
| [Managed Resources](docs/managedResources.md)                                                                               | How Foldkit's Managed Resources run under a Provider                                |
| [Test views with Scene](docs/scene.md)                                                                                      | Foldkit Scene tests for React views                                                 |
| [Debug with Foldkit DevTools](docs/devtools.md)                                                                             | Foldkit's DevTools panel for React Providers                                        |
| [Limitations](docs/limitations.md)                                                                                          | What React Foldkit doesn't do today, so you can decide whether it fits              |
| [API reference](docs/reference.md)                                                                                          | Every import and what it guarantees                                                 |
| [How the runtime works](docs/architecture.md)                                                                               | Lifecycle, child Models, and async data                                             |
| [Project-cache example](https://github.com/rodygosset/react-foldkit/tree/main/packages/react-foldkit/examples/projectCache) | A keyed Query loaded from TanStack routes                                           |
| [ESLint presets](eslint/README.md)                                                                                          | Lint rules that keep app code in this architecture                                  |
| [Agent guide](AGENTS.md)                                                                                                    | Rules for AI agents writing app code                                                |
