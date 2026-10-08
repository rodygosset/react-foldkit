# React Foldkit

React bindings for [Foldkit](https://foldkit.dev), built on Effect. Application state lives in a Model. Messages describe events, pure updates change the Model, and Commands run side effects. React renders the result.

The examples below start with a counter, then add a child feature and preloaded route data. Each example is a separate application; replace the previous `App.tsx` when moving to the next one.

## Run locally

Use Bun 1.3.14 and Node.js 20.19.0 or newer.

This workspace depends on a sibling `../foldkit` checkout from [rodygosset/foldkit](https://github.com/rodygosset/foldkit), on `feat/query-httpapi`. Build that checkout before installing this workspace.

```sh
pnpm --dir ../foldkit install
pnpm --dir ../foldkit --filter foldkit build
bun install --frozen-lockfile
bun run dev --filter=web
```

After changing Foldkit, rebuild it and run `bun install --force --frozen-lockfile` here.

## Create a counter

We'll start with a button that increments a counter. Create `App.tsx` and render its `App` component from your React entry point.

```tsx
import { Schema } from "effect"
import { defineMessageUnion } from "react-foldkit/message"
import { defineApplication } from "react-foldkit/react"
import { modifyFields } from "react-foldkit/struct"

const Model = Schema.Struct({ count: Schema.Finite })
type Model = typeof Model.Type

const Message = defineMessageUnion({ ClickedIncrement: {} })
type Message = typeof Message.Type

const update = (model: Model, message: Message) =>
  Message.match(message, {
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
import { defineMessageUnion } from "react-foldkit/message"
import { modifyFields } from "react-foldkit/struct"
import * as Submodel from "react-foldkit/submodel"
import type * as Update from "react-foldkit/update"

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

Replace `App.tsx` with the parent application below. `Submodel.lift` describes where the form's Model lives and how its Messages reach the parent. `Update.foldChild` runs the form update and handles its `Submitted` event.

```tsx
import { Array, Option, Schema } from "effect"
import { defineMessageUnion } from "react-foldkit/message"
import { defineApplication } from "react-foldkit/react"
import { modifyFields } from "react-foldkit/struct"
import * as Submodel from "react-foldkit/submodel"
import * as Update from "react-foldkit/update"
import * as Form from "./form"

const Model = Schema.Struct({ form: Form.Model, todos: Schema.Array(Schema.String) })
type Model = typeof Model.Type

const Message = defineMessageUnion({ GotFormMessage: { message: Form.Message } })
type Message = typeof Message.Type

const form = Submodel.lift({
  read: (model: Model) => model.form,
  toParentMessage: (message: Form.Message) => Message.GotFormMessage({ message }),
})

const foldChild = Update.foldChild({
  update: Form.update,
  read: (model: Model) => Option.some(form.read(model)),
  write: (model, form) => modifyFields(model, { form: () => form }),
  toParentMessage: form.toParentMessage,
  foldOutMessage: (out) => (model) => ({
    model: modifyFields(model, { todos: (todos) => Array.append(todos, out.text) }),
  }),
})

const update = (model: Model, message: Message) =>
  Message.match(message, { GotFormMessage: ({ message }) => foldChild(model, message) })

const Application = defineApplication({ Model, update })

function View() {
  const todos = Application.useModel((model) => model.todos)

  return (
    <>
      <Application.SubmodelProvider
        lift={form}
        render={({ source }) => (
          <Form.Provider source={source}>
            <Form.View />
          </Form.Provider>
        )}
      />
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

## Preload a Query with TanStack Router

A Foldkit Query keeps track of a request's data, failure, and pending state. A route loader can run the Query before rendering the page and deliver its result to the application.

This example uses `@tanstack/react-router`, `@tanstack/router-core`, and `@tanstack/react-store`. Create `profile.tsx`. The Query returns a local profile so you can try the example without a server. Replace `execute` with your data-loading Effect when connecting a backend.

```tsx
import { Effect, Schema } from "effect"
import * as Query from "foldkit/experimental/query"
import * as AsyncData from "react-foldkit/asyncData"
import * as Command from "react-foldkit/command"
import * as Loader from "react-foldkit/loader"
import { defineMessageUnion } from "react-foldkit/message"
import { defineApplication } from "react-foldkit/react"
import { modifyFields } from "react-foldkit/struct"
import type * as Update from "react-foldkit/update"

const Profile = Schema.Struct({ name: Schema.String, revision: Schema.Finite })

export const query = Query.define({
  name: "Profile",
  data: Profile,
  error: Schema.String,
  execute: Effect.succeed({ name: "Ada", revision: 1 }),
})

export const loader = Loader.fromQuery(query)

const Model = Schema.Struct({ profile: query.Model })
type Model = typeof Model.Type

const Message = defineMessageUnion({
  GotProfileMessage: { message: query.Message },
  LoadedProfile: { load: loader.Load },
})
type Message = typeof Message.Type

const toParentMessage = (message: typeof query.Message.Type) => Message.GotProfileMessage({ message })
const profile = query.lift<Model, Message>({ parentField: "profile", toParentMessage })

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    GotProfileMessage: ({ message }) => profile.fold(model, message),
    LoadedProfile: ({ load }) => {
      const settled = Loader.settleQueryIf(query, model.profile, load.result, {
        fresher: (incoming, current) => incoming.revision > current.revision,
      })

      return {
        model: modifyFields(model, { profile: () => settled.model }),
        commands: Command.mapMessages(settled.commands, toParentMessage),
      }
    },
  })

export const declaration = loader.pipe(Loader.mapMessages((load) => Message.LoadedProfile({ load })))
export const { Provider, useModel } = defineApplication({ Model, update })
export const init = { model: { profile: query.init() } }

export function View() {
  const result = useModel((model) => query.read(model.profile))

  return AsyncData.matchData(result, {
    onEmpty: () => <p>Loading profile...</p>,
    onFailure: (error) => <p>{error}</p>,
    onData: (profile) => <h1>Hello, {profile.name}</h1>,
  })
}
```

Replace `App.tsx` with the router below. The route's `loader` returns the encoded Query result. `TanStack.make` connects successful route results to the application Provider, using the declaration to turn each result into `LoadedProfile`.

```tsx
import { createRootRoute, createRouter, RouterProvider, useRouter } from "@tanstack/react-router"
import { Effect } from "effect"
import * as TanStack from "react-foldkit/tanstack"
import * as Profile from "./profile"

const route = createRootRoute({
  loader: () => Effect.runPromise(Profile.loader.loadQuery),
  component: View,
})

const router = createRouter({ routeTree: route })

function View() {
  const router = useRouter()

  return (
    <Profile.Provider
      init={Profile.init}
      createCommitSource={() => TanStack.make(router, [Profile.declaration])}
    >
      <Profile.View />
    </Profile.Provider>
  )
}

export function App() {
  return <RouterProvider router={router} />
}
```

Open the page to see **Hello, Ada**. The Provider applies the loaded result to the Query Model before rendering its children. `settleQueryIf` uses the profile revision to keep an older route result from replacing newer data.

For Queries that take arguments and cache several resources, see the [project-cache example](packages/react-foldkit/examples/projectCache/README.md).

## Find your way around

- `packages/react-foldkit` contains the library, its ESLint plugin, tests, and a project-cache example.
- `apps/web` contains the runnable demo app.
- `packages/ui` contains shared demo components.
- `repos/foldkit` and `repos/effect` contain upstream source references. They are outside the workspace build.

Read [how the runtime works](packages/react-foldkit/docs/architecture.md), [how to verify changes](docs/verification.md), and the [JSDoc playbook](docs/jsdocPlaybook.md).
