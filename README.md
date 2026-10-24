# React Foldkit

React bindings for [Foldkit](https://foldkit.dev), built on Effect. Application state lives in a Model. Messages describe events, pure updates change the Model, and Commands run side effects. React renders the result.

> React Foldkit is experimental. Breaking changes may occur in minor releases. See the [changelog](packages/react-foldkit/CHANGELOG.md) for changes and migration steps.

Compatible fixes use patch releases. Features use minor releases.

## Install

```sh
npm install react-foldkit foldkit@^0.169.0 effect@4.0.0 react@^19.2.6
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

function View() {
  const count = Counter.useModel((model) => model.count)
  const send = Counter.useSend()

  return <button onClick={() => send.ClickedIncrement()}>{count}</button>
}

export function App() {
  return (
    <Counter.Provider init={{ model: { count: 0 } }}>
      <View />
    </Counter.Provider>
  )
}
```

The button starts at `0`. Each click sends a Message to update, which returns the next Model. `useModel` subscribes the view to the count, so the button displays `1`, then `2`.

`useSend` returns one function per Message tag. `send.ClickedIncrement()` builds the Message with the union's constructor, so it takes the same fields as `Message.ClickedIncrement`. Call `send(message)` to send a Message you already built.

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

export const { Provider, useModel, useSend } = Submodel.define({ Model, Message })

export function View() {
  const draft = useModel((model) => model.draft)
  const send = useSend()

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        send.ClickedSubmit()
      }}
    >
      <input
        aria-label="New todo"
        value={draft}
        onChange={(event) => send.ChangedDraft({ text: event.target.value })}
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
import * as Application from "react-foldkit/application"
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

const Todos = Application.define({ Model, Message, update })

function View() {
  const todos = Todos.useModel((model) => model.todos)

  return (
    <>
      <Form.Provider
        from={Todos}
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
    <Todos.Provider init={{ model: { form: { draft: "" }, todos: [] } }}>
      <View />
    </Todos.Provider>
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
import * as Application from "react-foldkit/application"

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

const { Provider, useModel, useSend } = Application.define({ Model, Message, update })
const init = profile.loadIfMissing({ profile: query.init() })

function View() {
  const result = useModel((model) => query.read(model.profile))
  const send = useSend()

  return (
    <>
      {AsyncData.matchData(result, {
        onEmpty: () => <p>Loading profile...</p>,
        onFailure: (error) => <p>{error}</p>,
        onData: (profile) => <h1>Hello, {profile.name}</h1>,
      })}
      <button onClick={() => send.ClickedRefresh()}>Refresh</button>
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

## Open an optional child

Some children exist only part of the time, such as an editor that opens on double-click. Store the child Model in an `Option` field and give its Provider an `optionalLift`. The Provider renders its children while the field is `Some` and `fallback` while it is `None`.

Create `editor.tsx`. It reports `Saved` or `Discarded` to its parent.

```tsx
import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"
import type * as Update from "foldkit/update"
import * as Submodel from "react-foldkit/submodel"

export const Model = Schema.Struct({ id: Schema.String, title: Schema.String })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ChangedTitle: { title: Schema.String },
  PressedEnter: {},
  PressedEscape: {},
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  Saved: { id: Schema.String, title: Schema.String },
  Discarded: {},
})
export type OutMessage = typeof OutMessage.Type

export const update = (model: Model, message: Message) =>
  Message.match<Update.ReturnWithOutMessage<Model, Message, OutMessage>>(message, {
    ChangedTitle: ({ title }) => ({ model: modifyFields(model, { title: () => title }) }),
    PressedEnter: () => ({ model, outMessage: OutMessage.Saved({ id: model.id, title: model.title }) }),
    PressedEscape: () => ({ model, outMessage: OutMessage.Discarded() }),
  })

export const { Provider, useModel, useSend } = Submodel.define({ Model, Message })

export function View() {
  const title = useModel((model) => model.title)
  const send = useSend()

  return (
    <input
      autoFocus
      value={title}
      onChange={(event) => send.ChangedTitle({ title: event.target.value })}
      onKeyDown={(event) => {
        if (event.key === "Enter") send.PressedEnter()
        if (event.key === "Escape") send.PressedEscape()
      }}
    />
  )
}
```

The parent opens the editor by setting `editing` to `Some`, and folds its OutMessages. It drops editor Messages that arrive after the editor closed.

```tsx
import { Array, Option, Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"
import type * as Update from "foldkit/update"
import * as Application from "react-foldkit/application"
import type * as Submodel from "react-foldkit/submodel"
import * as Editor from "./editor"

const Todo = Schema.Struct({ id: Schema.String, title: Schema.String })

const Model = Schema.Struct({ todos: Schema.Array(Todo), editing: Schema.Option(Editor.Model) })
type Model = typeof Model.Type

const Message = defineMessageUnion({
  DoubleClickedTodo: { id: Schema.String },
  GotEditorMessage: { message: Editor.Message },
})
type Message = typeof Message.Type

const closeEditor = (model: Model) => modifyFields(model, { editing: () => Option.none() })

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    DoubleClickedTodo: ({ id }) => ({
      model: modifyFields(model, { editing: () => Array.findFirst(model.todos, (todo) => todo.id === id) }),
    }),
    GotEditorMessage: ({ message }) =>
      Option.match(model.editing, {
        onNone: () => ({ model }),
        onSome: (editing) => {
          const result = Editor.update(editing, message)
          if (result.outMessage === undefined) {
            return { model: modifyFields(model, { editing: () => Option.some(result.model) }) }
          }
          return Editor.OutMessage.match(result.outMessage, {
            Saved: ({ id, title }) => ({
              model: modifyFields(closeEditor(model), {
                todos: Array.map((todo) => (todo.id === id ? { ...todo, title } : todo)),
              }),
            }),
            Discarded: () => ({ model: closeEditor(model) }),
          })
        },
      }),
  })

const Todos = Application.define({ Model, Message, update })

const editing: Submodel.OptionalProjection<Model, Message, Editor.Model, Editor.Message> = {
  read: (model) => model.editing,
  toParentMessage: (message) => Message.GotEditorMessage({ message }),
}

function View() {
  const todos = Todos.useModel((model) => model.todos)
  const send = Todos.useSend()

  return (
    <>
      <ul>
        {todos.map((todo) => (
          <li key={todo.id} onDoubleClick={() => send.DoubleClickedTodo({ id: todo.id })}>
            {todo.title}
          </li>
        ))}
      </ul>
      <Editor.Provider from={Todos} optionalLift={editing} fallback={<p>Double-click a todo to rename it.</p>}>
        <Editor.View />
      </Editor.Provider>
    </>
  )
}

export function App() {
  return (
    <Todos.Provider init={{ model: { todos: [{ id: "1", title: "Buy milk" }], editing: Option.none() } }}>
      <View />
    </Todos.Provider>
  )
}
```

Double-click **Buy milk** to open the editor. **Enter** saves the title and **Escape** discards it; both close the editor and show the hint again.

## Keep the logic in a Program

`Program.make` groups a feature's Model, Message union, `init`, `update`, and Subscriptions without importing React. The field names match Foldkit's `Runtime.makeApplication`, so the same module can run in React, in a Store, in Foldkit Story tests, or later in a Foldkit application with a view.

```ts
// counter.ts
import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"
import type * as Update from "foldkit/update"
import * as Program from "react-foldkit/program"

export const Model = Schema.Struct({ count: Schema.Finite })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({ ClickedIncrement: {} })
export type Message = typeof Message.Type

export const init = (): Update.Return<Model, Message> => ({ model: { count: 0 } })

export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedIncrement: () => ({ model: modifyFields(model, { count: (count) => count + 1 }) }),
  })

export const program = Program.make({ Model, Message, init, update })
```

Pass the Program to `Application.define`, and React-only options and `resources` as the second argument. Because the Program has an `init`, the Provider needs no `init` prop; pass one to replace it, for example with server data.

```tsx
// App.tsx
import * as Application from "react-foldkit/application"
import * as Counter from "./counter"

const CounterApp = Application.define(Counter.program, { retainInactive: "1 second" })

function View() {
  const count = CounterApp.useModel((model) => model.count)
  const send = CounterApp.useSend()

  return <button onClick={() => send.ClickedIncrement()}>{count}</button>
}

export function App() {
  return (
    <CounterApp.Provider>
      <View />
    </CounterApp.Provider>
  )
}
```

A child Program declares an `OutMessage` union and usually no `init`, since its parent creates the child Model. Pass it to `Submodel.define` to get its hooks.

## Find your way around

- `packages/react-foldkit` contains the library, its ESLint plugin, tests, and a project-cache example.
- `apps/web` contains the runnable demo app.
- `packages/ui` contains shared demo components.
- `repos/foldkit` and `repos/effect` contain upstream source references. They are outside the workspace build.

Read [how the runtime works](packages/react-foldkit/docs/architecture.md), [how to verify changes](docs/verification.md), and [how to release](docs/releasing.md).
