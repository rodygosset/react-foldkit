# React Foldkit

React bindings for [Foldkit](https://foldkit.dev), built on Effect. Application state lives in a Model. Messages describe events, pure updates change the Model, and Commands run side effects. React renders the result.

> React Foldkit is experimental. Breaking changes may occur in minor releases. See the [changelog](packages/react-foldkit/CHANGELOG.md) for changes and migration steps.

Compatible fixes use patch releases. Features use minor releases.

## Install

```sh
npm install react-foldkit foldkit@^0.168.0 effect@4.0.0 react@^19.2.6
```

See the [requirements](packages/react-foldkit/README.md#requirements) and [ESLint setup](packages/react-foldkit/eslint/README.md).

The examples below start with a counter, then add a child feature and load data with a Query. Each example is a separate application; replace the previous `App.tsx` when moving to the next one.

## Run locally

Use Bun 1.3.14 and Node.js 24.

The workspace installs the official Foldkit package from npm.

```sh
bun install --frozen-lockfile
bun run dev --filter=web
```

## Create a counter

We'll start with a button that increments a counter. Create `App.tsx` and render its `App` component from your React entry point.

```tsx
import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import { defineApplication } from "react-foldkit/react"
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

const Application = defineApplication({ Model, update })

function View() {
  const count = Application.useModel((model) => model.count)
  const dispatch = Application.useDispatch()

  return <button onClick={() => dispatch(Message.ClickedIncrement())}>{count}</button>
}

export function App() {
  return (
    <Application.Provider init={{ model: { count: 0 } }}>
      <View />
    </Application.Provider>
  )
}
```

The button starts at `0`. Each click sends a Message to update, which returns the next Model. `useModel` subscribes the view to the count, so the button displays `1`, then `2`.

The Provider owns the application state. Updates are pure; return Commands when an update needs to run an Effect. See the [counter with a delayed increment](packages/react-foldkit/docs/examples.md) for that next step.

## Give a todo form its own Submodel

A Submodel lets a feature define its own state, events, and view while the parent application owns its lifetime. We'll give a todo form a draft field and let it tell the parent when a todo is submitted.

Create `form.tsx`. The form handles editing and clears its draft after submission. Its `OutMessage` describes the submitted todo for the parent.

```tsx
import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"
import * as Submodel from "react-foldkit/submodel"
import type * as Update from "foldkit/update"

export const Model = Schema.Struct({ draft: Schema.String })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ChangedDraft: { text: Schema.String },
  ClickedSubmit: {},
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({ Submitted: { text: Schema.String } })
export type OutMessage = typeof OutMessage.Type

export const update = (model: Model, message: Message) =>
  Message.match<Update.ReturnWithOutMessage<Model, Message, OutMessage>>(message, {
    ChangedDraft: ({ text }) => ({ model: modifyFields(model, { draft: () => text }) }),
    ClickedSubmit: () => {
      const text = model.draft.trim()
      if (text === "") return { model }

      return {
        model: modifyFields(model, { draft: () => "" }),
        outMessage: OutMessage.Submitted({ text }),
      }
    },
  })

export const { Provider, useModel, useDispatch } = Submodel.define<Model, Message>()

export function View() {
  const draft = useModel((model) => model.draft)
  const dispatch = useDispatch()

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        dispatch(Message.ClickedSubmit())
      }}
    >
      <input
        aria-label="New todo"
        value={draft}
        onChange={(event) => dispatch(Message.ChangedDraft({ text: event.target.value }))}
      />
      <button type="submit">Add todo</button>
    </form>
  )
}
```

Replace `App.tsx` with the parent application below. `Submodel.lift` describes the form once: it reads and writes the `form` field, wraps form Messages for the parent, and folds the form update, including its `Submitted` event.

```tsx
import { Array, Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"
import type * as Update from "foldkit/update"
import { defineApplication } from "react-foldkit/react"
import * as Submodel from "react-foldkit/submodel"
import * as Form from "./form"

const Model = Schema.Struct({ form: Form.Model, todos: Schema.Array(Schema.String) })
type Model = typeof Model.Type

const Message = defineMessageUnion({ GotFormMessage: { message: Form.Message } })
type Message = typeof Message.Type

const form = Submodel.lift<Model>()({
  field: "form",
  update: Form.update,
  toParentMessage: (message: Form.Message) => Message.GotFormMessage({ message }),
  foldOutMessage: (out) => (model: Model) => ({
    model: modifyFields(model, { todos: (todos) => Array.append(todos, out.text) }),
  }),
})

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    GotFormMessage: ({ message }) => form.fold(model, message),
  })

const Application = defineApplication({ Model, update })

function View() {
  const todos = Application.useModel((model) => model.todos)

  return (
    <>
      <Form.Provider
        from={Application}
        lift={form}
      >
        <Form.View />
      </Form.Provider>
      <ul>
        {todos.map((todo, index) => (
          <li key={index}>{todo}</li>
        ))}
      </ul>
    </>
  )
}

export function App() {
  return (
    <Application.Provider init={{ model: { form: { draft: "" }, todos: [] } }}>
      <View />
    </Application.Provider>
  )
}
```

Type **Buy milk**, then click **Add todo**. The draft clears and the list gains an item. Empty submissions do nothing. The form has its own hooks, but shares the parent Store, so its state remains part of the application Model.

## Load a Query

A Foldkit Query keeps track of a request's data, failure, and pending state. It is a viewless Submodel: update calls its lift, and the lift returns the Commands that fetch the data.

Create `profile.tsx`. The Query returns a local profile so you can try the example without a server. Replace `execute` with your data-loading Effect when connecting a backend.

```tsx
import { Effect, Schema } from "effect"
import * as AsyncData from "foldkit/asyncData"
import * as Query from "foldkit/experimental/query"
import { defineMessageUnion } from "foldkit/message"
import type * as Update from "foldkit/update"
import { defineApplication } from "react-foldkit/react"

const Profile = Schema.Struct({ name: Schema.String })

const query = Query.define({
  name: "Profile",
  data: Profile,
  error: Schema.String,
  execute: Effect.succeed({ name: "Ada" }),
})

const Model = Schema.Struct({ profile: query.Model })
type Model = typeof Model.Type

const Message = defineMessageUnion({
  GotProfileMessage: { message: query.Message },
  ClickedRefresh: {},
})
type Message = typeof Message.Type

const profile = query.lift<Model, Message>({
  parentField: "profile",
  toParentMessage: (message) => Message.GotProfileMessage({ message }),
})

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    GotProfileMessage: ({ message }) => profile.fold(model, message),
    ClickedRefresh: () => profile.revalidate(model),
  })

const { Provider, useModel, useDispatch } = defineApplication({ Model, update })
const init = profile.loadIfMissing({ profile: query.init() })

function View() {
  const result = useModel((model) => query.read(model.profile))
  const dispatch = useDispatch()

  return (
    <>
      {AsyncData.matchData(result, {
        onEmpty: () => <p>Loading profile...</p>,
        onFailure: (error) => <p>{error}</p>,
        onData: (profile) => <h1>Hello, {profile.name}</h1>,
      })}
      <button onClick={() => dispatch(Message.ClickedRefresh())}>Refresh</button>
    </>
  )
}

export function App() {
  return (
    <Provider init={init}>
      <View />
    </Provider>
  )
}
```

Open the page to see **Loading profile...**, then **Hello, Ada**. `init` marks the profile as pending and returns the fetch Command, which the Provider starts on activation. **Refresh** revalidates the profile while keeping the current data on screen.

For Queries that take arguments and cache several resources across TanStack routes, see the [project-cache example](packages/react-foldkit/examples/projectCache/README.md).

## Find your way around

- `packages/react-foldkit` contains the library, its ESLint plugin, tests, and a project-cache example.
- `apps/web` contains the runnable demo app.
- `packages/ui` contains shared demo components.
- `repos/foldkit` and `repos/effect` contain upstream source references. They are outside the workspace build.

Read [how the runtime works](packages/react-foldkit/docs/architecture.md), [how to verify changes](docs/verification.md), and [how to release](docs/releasing.md).
