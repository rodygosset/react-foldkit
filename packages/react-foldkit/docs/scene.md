# Test views with Scene

Foldkit's [Scene](https://foldkit.dev/testing/scene) tests a feature through its view. It renders the view for a Model, clicks and types like a user, runs each Message through `update`, and makes you resolve every Command by hand.

React Foldkit runs the same Scene steps on React components. If the feature's view later moves to Foldkit, the test changes one import.

## Bind the view once

A component that calls `App.useModel()` and `App.useSend()` needs its application. Bind the two next to the component, and export the result as the feature's `view`:

```tsx
// view.tsx
import { bindSceneView } from "react-foldkit/scene/react"
import { App } from "./application"

function Profile() {
  const model = App.useModel()
  const send = App.useSend()

  return (
    <main>
      <button onClick={() => send.ClickedLoad()}>Load user</button>
      <p role="status">{model.loading ? "Loading" : model.name}</p>
    </main>
  )
}

export const view = bindSceneView(App, Profile)
```

The binding starts no Store. Inside a scene, `useModel` reads the Scene's current Model, and `useSend` passes Messages to Scene. So Commands and Subscriptions run only when a Scene step runs them.

## Write the test with Foldkit's steps

```ts
import { Command, click, expect, given, role, scene } from "react-foldkit/scene"
import { test } from "vitest"
import { FetchUser, Message, initialModel, update } from "./program"
import { view } from "./view"

test("loads a user", () => {
  scene(
    { update, view },
    given(initialModel),

    click(role("button", { name: "Load user" })),
    expect(role("status")).toHaveText("Loading"),

    Command.expectExact(FetchUser({ userId: "42" })),
    Command.resolve(FetchUser, Message.LoadedUser({ name: "Ada" })),

    expect(role("status")).toHaveText("Ada")
  )
})
```

You write no `render`, `act`, or cleanup. Each `scene` renders the component in its own React root and unmounts it when the scene ends, even if a step throws. As in Foldkit, the scene fails if a Command is left unresolved.

If both the scene and the React cleanup fail, Scene reports both in an `AggregateError`. A single failure keeps its original error.

### What finishes before the next step

- Synchronous React effects and local state updates.
- Messages sent from effects. They go through `update` as part of the current step, and their Commands wait until the test resolves them.

If effect Messages keep changing the Model, Scene stops after 100 renders and fails. Timers, promises, transitions, and suspended work need an asynchronous test outside Scene.

## Migrate to Foldkit

When `./view` exports a Foldkit view instead, change the import and keep the rest of the test:

```diff
- import { Command, click, expect, given, role, scene } from "react-foldkit/scene"
+ import { Command, click, expect, given, role, scene } from "foldkit/scene"
```

`react-foldkit/scene` exports the same names as `foldkit/scene`, and its `scene` accepts Foldkit views too. So a test suite can move one feature at a time.

## What runs on React views

| Scene feature                                                                                                           | React views                                                           |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Locators, `inside`, `within`, `expectAll`                                                                               | Supported                                                             |
| Interactions such as click, change, type, keyboard, pointer, focus, submit, and files                                   | Supported. Checkbox and radio clicks fire `onChange`, as in React DOM |
| Element matchers such as text, value, attributes, `className`, `style`, disabled, checked, visible, and `toHaveHandler` | Supported                                                             |
| `Command`, `Subscription`, `ManagedResource`, OutMessage, and ignored-interaction steps                                 | Supported. These steps work on `update`, not on the view              |
| `Mount` steps and `toHaveHook`                                                                                          | Not available. React views have no Foldkit Mounts or element hooks    |

### Limits

Scene reads the elements React renders, not a browser DOM. Test components that need layout, refs to real DOM nodes, or browser APIs during render in a browser test instead. The bound component must render one element, such as a `<main>`, at its root.

### How events behave

- `target` is the element the interaction started on, and `currentTarget` is the element whose handler is running.
- Capture handlers run before bubble handlers, and `stopPropagation` stops the event along that path.
- A controlled input goes back to its React value when a handler rejects an edit. A select's chosen option follows its value.

- Events have `type`, `isDefaultPrevented()`, and `isPropagationStopped()`.
- Input and textarea values are always strings, even when the React prop is a number.
- Attribute reads and Scene selectors use the HTML and SVG attribute names.
- A boolean HTML attribute set to `false` is absent. `aria-*` and `data-*` booleans stay strings.

Bound scenes run a copy of Foldkit's Scene runner, pinned to the tested Foldkit release. [The copy's notes](https://github.com/rodygosset/react-foldkit/blob/main/packages/react-foldkit/src/scene/vendor/README.md) explain why it exists.
