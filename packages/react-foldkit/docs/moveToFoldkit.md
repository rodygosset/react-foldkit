# Move to Foldkit

React Foldkit is a step on the way to Foldkit, not a place to stay. You move a React app's state and side effects into Foldkit Programs while React still renders the page. When a feature's logic lives in a Program, you replace its React view with a Foldkit view and run it on Foldkit's own runtime.

This guide shows what moves unchanged and what you rewrite.

## Most of a feature moves unchanged

| Part of the feature | When it moves to Foldkit |
| --- | --- |
| Model Schema and Messages | Stay the same. They are Effect Schema and Foldkit's `defineMessageUnion`. |
| `update`, `init`, and Commands | Stay the same. They import from `effect` and `foldkit` only. |
| Subscriptions and Managed Resources | Stay the same. They are Foldkit's `Subscription` and `ManagedResource`. |
| The Program from `Program.make` | Passes to Foldkit's runtime as it is. Its field names match `Runtime.makeApplication`. |
| Services in `resources` | The same Layer goes to the runtime's `resources` field. |
| Scene tests | Change one import, from `react-foldkit/scene` to `foldkit/scene`. |
| React views | You rewrite them as Foldkit views. |
| `Application.define` options | `restartInterrupted`, `onReactivate`, and `retainInactive` exist because React can hide a Provider. Foldkit's runtime doesn't take them. |

The view is the only part you rewrite. So the more logic a feature keeps out of its components, the less work its move takes.

## Keep the Program free of React

Do this while the app still runs on React. It makes each later move small.

1. Put the Model, Messages, `update`, `init`, and Commands in a module that imports nothing from React. Export the result of `Program.make`.
2. Keep side effects in Commands. A fetch in a `useEffect` or an event handler has to be rewritten later, while a Command moves as it is.
3. Keep app state in the Model. A `useState` in a view is state that Foldkit's view can't see. The `strictConfig` ESLint preset from `react-foldkit/eslint` warns about it.
4. Keep navigation in Commands, as [the routing guide](routing.md) shows.

```ts
// counter/program.ts
import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"
import type * as Update from "foldkit/update"
import * as Program from "react-foldkit/program"

export const Model = Schema.Struct({ count: Schema.Finite })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({ ClickedIncrement: {}, ClickedReset: {} })
export type Message = typeof Message.Type

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedIncrement: () => ({ model: modifyFields(model, { count: (count) => count + 1 }) }),
    ClickedReset: () => ({ model: modifyFields(model, { count: () => 0 }) }),
  })

const init = () => ({ model: { count: 0 } })

export const counter = Program.make({ Model, Message, init, update })
```

React reads this Program through `Application.define(counter)`. Foldkit's runtime reads the same object.

## Rewrite the view

A React view reads the Model with `useModel` and sends Messages with `useSend`:

```tsx
// counter/view.tsx
const Counter = Application.define(counter)

function CounterView() {
  const count = Counter.useModel((model) => model.count)
  const send = Counter.useSend()

  return (
    <div>
      <output>{count}</output>
      <button onClick={() => send.ClickedIncrement()}>Increment</button>
      <button onClick={() => send.ClickedReset()}>Reset</button>
    </div>
  )
}
```

A Foldkit view is a function of the Model. It builds elements with `h`, and each event handler names the Message to send:

```ts
// counter/view.ts
import type { Html, HtmlBuilder } from "foldkit/html"
import { Message, type Model } from "./program"

export const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [],
    [
      h.output([], [String(model.count)]),
      h.button([h.OnClick(Message.ClickedIncrement())], ["Increment"]),
      h.button([h.OnClick(Message.ClickedReset())], ["Reset"]),
    ]
  )
```

[Foldkit's view guide](https://foldkit.dev/core/view) covers attributes, keyed lists, and lazy views.

## Run the feature on Foldkit's runtime

`Runtime.makeElement` runs a Program in one element of a page it doesn't own. Pass it the Program, the view, and the container:

```ts
// counter/main.ts
import { Runtime } from "foldkit"
import { counter } from "./program"
import { view } from "./view"

Runtime.run(Runtime.makeElement({ ...counter, view, container: document.getElementById("counter") }))
```

When a Program needs services, pass the same Layer you gave `Application.define` as `resources`. Once Foldkit owns the whole page, use `Runtime.makeApplication`, whose view returns a `Document` with the page title.

To keep a Foldkit feature inside a React page while the rest of the app moves, read [Foldkit's embedding guide](https://foldkit.dev/core/embedding).

## Move the tests

Scene tests run the same steps on React views and Foldkit views. When `./view` exports the Foldkit view, change the import and keep the test:

```diff
- import { Command, click, expect, given, role, scene } from "react-foldkit/scene"
+ import { Command, click, expect, given, role, scene } from "foldkit/scene"
```

Story tests call `update` directly, so they don't change at all. [Test views with Scene](scene.md) explains how to bind a React view for Scene.

## Move features from the leaves up

1. Start with a feature that has no child features, such as a form or a widget.
2. Move a parent after its children. A child Program defined with `Submodel.define` keeps its Model and Messages, and Foldkit's [Submodels](https://foldkit.dev/core/submodel) take the same parts.
3. Move routing last. Until then, the React router owns the URL, as [the routing guide](routing.md) describes. Foldkit's [routing](https://foldkit.dev/core/routing-and-navigation) replaces it when the whole page moves.
4. Remove `react-foldkit` when no feature imports it.
