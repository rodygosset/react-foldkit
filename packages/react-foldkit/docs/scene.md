# Test views with Scene

Foldkit's [Scene](https://foldkit.dev) tests a feature through its view: it renders the view for a Model, performs interactions, runs Messages through `update`, and makes you resolve every Command. React Foldkit runs the same Scene steps against React components. When the feature's view later moves to Foldkit, the test changes one import.

## Bind the view once

A component that calls `App.useModel()` and `App.useSend()` needs its application. Bind it next to the component and export the result as the feature's `view`.

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

The binding starts no Store. Inside a scene, `useModel` reads the Scene's current Model and `useSend` hands Messages to Scene, so Commands and Subscriptions run only as Scene steps.

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

		expect(role("status")).toHaveText("Ada"),
	)
})
```

There is no `render`, `act`, or cleanup. Each `scene` renders the component in a private React root and unmounts it when the scene ends, including when a step throws. The scene fails if a Command is left unresolved, as it does in Foldkit.

Synchronous React effects and local state updates finish before the next step. Messages from effects pass through `update` as part of the current step, and their Commands stay pending until the test resolves them. Scene fails after 100 renders if effect messages keep changing the Model without settling. Timers, promises, transitions, and suspended work require an asynchronous test outside Scene.

## Migrate to Foldkit

When `./view` exports a Foldkit view instead, change the import and keep the test:

```diff
- import { Command, click, expect, given, role, scene } from "react-foldkit/scene"
+ import { Command, click, expect, given, role, scene } from "foldkit/scene"
```

`react-foldkit/scene` exports the same names as `foldkit/scene`, and its `scene` accepts Foldkit views too, so a test suite can migrate one feature at a time.

## What runs on React views

| Scene feature | React views |
| --- | --- |
| Locators, `inside`, `within`, `expectAll` | Supported |
| Interactions: click, change, type, keyboard, pointer, focus, submit, files | Supported. Checkbox and radio clicks fire `onChange`, as in React DOM |
| Element matchers: text, value, attributes, `className`, `style`, disabled, checked, visible, `toHaveHandler` | Supported |
| `Command`, `Subscription`, `ManagedResource`, OutMessage, and ignored-interaction steps | Supported; these work on `update` and are view-independent |
| `Mount` steps and `toHaveHook` | Not applicable: React views produce no Foldkit Mounts or element hooks |

Scene reads React's rendered host elements, not a browser DOM. Components that need layout, refs to real DOM nodes, or browser APIs in render belong in browser tests. The bound component must render one host element at its root.

Interactions use the original host element as `target` and the element owning each handler as `currentTarget`. Capture handlers run before bubble handlers, and `stopPropagation` stops delivery along that path. Controlled inputs restore their React values when a handler rejects an edit. Option selection follows the select's value.

Bound scenes run a copy of Foldkit's Scene runner pinned to the tested Foldkit release. See [the copy's notes](https://github.com/rodygosset/react-foldkit/blob/main/packages/react-foldkit/src/scene/vendor/README.md).
