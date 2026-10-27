# Move to Foldkit

React Foldkit exists so that a React app can become a Foldkit app without a rewrite. You move one feature at a time, and the app keeps working and shipping after every step. This guide shows the whole path.

## Why one feature at a time

A rewrite stops feature work until it is done, then ships everything at once. Moving one feature at a time keeps each step small enough to review, test, and release on its own. The parts you haven't touched keep running as they are.

## The path has two stages

| Stage             | What changes                                                     | Who renders the feature      |
| ----------------- | ---------------------------------------------------------------- | ---------------------------- |
| 1. Move the logic | The feature's state and side effects move into a Foldkit Program | React, through React Foldkit |
| 2. Move the view  | The feature's React components are rewritten as a Foldkit view   | Foldkit's runtime            |

Stage 1 is where React Foldkit does its work, and it is most of the job. A feature that finished stage 1 already has a pure `update`, Commands for its side effects, Scene tests, and Foldkit's DevTools. You can stay in stage 1 for as long as you need.

## Stage 1: move the logic into a Program

Do this for one feature, such as a cart:

1. Write the feature's Program with `Program.make` from `react-foldkit/program`. The Program is plain Foldkit, so [Foldkit's architecture guide](https://foldkit.dev/core/architecture) explains its parts.
2. Define the application with `Application.define(cart)`, and render its Provider where the feature mounts.
3. In the feature's components, replace `useState` and `useEffect` with `useModel` to read the Model and `useSend` to send Messages.
4. Test the feature with Scene from `react-foldkit/scene`, as [Test views with Scene](scene.md) shows.

After step 3, a component only reads the Model and sends Messages:

```tsx
function CartButton() {
  const count = Cart.useModel((model) => model.items.length)
  const send = Cart.useSend()
  return <button onClick={() => send.ClickedAdd({ item: "Socks" })}>Cart ({count})</button>
}
```

Then move the next feature. Features that are still plain React keep working next to the ones you moved.

### Keep stage 2 cheap

Stage 2 rewrites only the view. Everything else in the feature moves unchanged, as long as you follow these rules during stage 1:

- Put the Program in a module that imports nothing from React.
- Keep side effects in Commands. A fetch in a `useEffect` or an event handler has to be rewritten later, while a Command moves as it is.
- Keep the feature's state in the Model. A `useState` in a component is state that a Foldkit view can't see.
- Keep navigation in Commands, as [Use a router](routing.md) shows.

The presets in [`react-foldkit/eslint`](../eslint/README.md) report some of these mistakes, such as navigation outside a Command and, with `strictConfig`, `useState` in a view.

## Stage 2: move the view to Foldkit

A Foldkit view is not a React component, so React can't render it. Foldkit's own runtime renders it into a DOM element. Moving a feature's view therefore means that Foldkit's runtime takes over that part of the page, and runs the same Program in place of the React Foldkit Provider.

First, write the view. It reads the same Model and sends the same Messages as the React component:

```ts
import type { Html, HtmlBuilder } from "foldkit/html"
import { Message, type Model } from "./program"

export const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.button([h.OnClick(Message.ClickedAdd({ item: "Socks" }))], [`Cart (${model.items.length})`])
```

[Foldkit's view guide](https://foldkit.dev/core/view) covers attributes, lists, and keyed elements. Then pick one of the two ways below to hand the feature to Foldkit's runtime.

### Hand over one feature while the page stays in React

Foldkit's `Runtime.embed` runs a Foldkit app inside a page that another framework owns. A small React component keeps an empty element, and Foldkit renders the feature inside it:

```tsx
import { Runtime } from "foldkit"
import { useEffect, useRef } from "react"
import { cart } from "./program"
import { view } from "./view"

export function Cart() {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handle = Runtime.embed(Runtime.makeElement({ ...cart, view, container: container.current }))
    return handle.dispose
  }, [])

  return <div ref={container} />
}
```

`Runtime.makeElement` takes the Program as it is, because its field names match. When the Program needs services, pass the same Layer you gave `Application.define` as `resources`. `handle.dispose` stops the feature when React unmounts the component.

After this step, the feature's Model lives in Foldkit's runtime, not in a React Foldkit Provider. React components outside the feature can't read it with `useModel` anymore. They exchange values with it through Ports, which [Foldkit's embedding guide](https://foldkit.dev/core/embedding) explains. So start with features that share little state with the rest of the page.

### Hand over the whole app at the end

When every feature's logic lives in a Program, you can switch the whole page at once:

1. Combine the features' Programs into one application Program. Child Programs become [Foldkit Submodels](https://foldkit.dev/core/submodel).
2. Rewrite the remaining views as Foldkit views.
3. Replace React's root with `Runtime.makeApplication`, and the React router with [Foldkit's routing](https://foldkit.dev/core/routing-and-navigation).
4. Remove `react-foldkit` from your dependencies.

## What moves unchanged

| Part of the feature                                        | In stage 2                                                        |
| ---------------------------------------------------------- | ----------------------------------------------------------------- |
| Model, Messages, `update`, `init`, and Commands            | Unchanged. They import from `effect` and `foldkit` only           |
| Subscriptions and Managed Resources                        | Unchanged                                                         |
| The Program from `Program.make`                            | Passes to Foldkit's runtime as it is                              |
| Services in `resources`                                    | The same Layer goes to the runtime's `resources` field            |
| Scene tests                                                | One import changes, from `react-foldkit/scene` to `foldkit/scene` |
| Story tests                                                | Unchanged, because they call `update` directly                    |
| React components                                           | Rewritten as a Foldkit view                                       |
| `restartInterrupted`, `onReactivate`, and `retainInactive` | Removed. They exist only because React can hide a Provider        |

The Scene test change looks like this:

```diff
- import { Command, click, expect, given, role, scene } from "react-foldkit/scene"
+ import { Command, click, expect, given, role, scene } from "foldkit/scene"
```
