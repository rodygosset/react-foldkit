# React Foldkit

React Foldkit runs [Foldkit](https://foldkit.dev) programs inside React, with Effect for side effects. Your app's state lives in a Model, outside your components. A Message describes something that happened. A pure `update` function turns the Model and a Message into the next Model, plus Commands for any side effects. React renders the result.

> React Foldkit is experimental. A minor release may break your code. The [changelog](packages/react-foldkit/CHANGELOG.md) lists each change and how to upgrade.

Patch releases fix bugs without breaking anything. Minor releases add features.

## Install

```sh
npm install react-foldkit foldkit@^0.169.0 effect@4.0.0 react@^19.2.6
```

The package README lists [the full requirements](packages/react-foldkit/README.md#install), and the [ESLint guide](packages/react-foldkit/eslint/README.md) sets up the lint rules.

The examples below build up step by step, from a counter to a child feature, a Query, an optional child, and a Program. Each one is a separate app, so replace the previous `App.tsx` when you move to the next.

## Run locally

To work on this repository, use Bun 1.3.14 and Node.js 24. The workspace installs the official Foldkit package from npm.

```sh
bun install --frozen-lockfile
bun run dev --filter=web
```

## Create a counter

First, a button that counts clicks. Create `App.tsx` and render its `App` component from your React entry point.

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

The button starts at `0`. Each click sends a Message to `update`, which returns the next Model. `useModel` re-renders the view when the count changes, so the button shows `1`, then `2`.

`useSend` returns one function per Message. `send.ClickedIncrement()` builds the Message with the union's own constructor, so it takes the same fields as `Message.ClickedIncrement`. To send a Message you already built, call `send(message)`.

The Provider owns the state. `update` stays pure, and returns Commands when it needs a side effect. [The counter tutorial](packages/react-foldkit/docs/examples.md) adds one.

## Give a todo form its own Submodel

A Submodel is a child feature with its own state, Messages, and view, while the parent app decides when it exists. Here, a todo form keeps its own draft text and tells the parent when someone submits a todo.

Create `form.tsx`. The form handles typing and clears its draft after a submit. Its `OutMessage`, a Message for the parent, carries the submitted todo.

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

Replace `App.tsx` with the parent app below. `Submodel.lift` describes the form in one place. It reads and writes the parent's `form` field, wraps the form's Messages for the parent, and runs the form's `update`, including its `Submitted` event.

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

Type **Buy milk**, then click **Add todo**. The draft clears and the list gains an item. An empty submit does nothing. The form has its own hooks but shares the parent's Store, so its state is still part of the app's Model.

## Load a Query

A Foldkit Query tracks one request's data, its failure, and whether it is still loading. It works like a Submodel with no view. `update` calls the Query's lift, and the lift returns the Commands that fetch the data.

Create `profile.tsx`. The Query returns a local profile, so you can try it without a server. To connect a backend, replace `execute` with your own loading Effect.

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

Open the page to see **Loading profile...**, then **Hello, Ada**. `init` marks the profile as loading and returns the fetch Command, which the Provider starts when it activates. **Refresh** fetches the profile again and keeps the current data on screen until the new data arrives.

For a Query that takes arguments and caches several results across TanStack routes, see the [project-cache example](packages/react-foldkit/examples/projectCache/README.md).

## Open an optional child

Some children exist only part of the time, such as an editor that opens on double-click. Store the child's Model in an `Option` field, and give its Provider an `optionalLift`. The Provider renders its children while the field is `Some`, and `fallback` while it is `None`.

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

The parent opens the editor by setting `editing` to `Some`, and handles the editor's OutMessages. It ignores editor Messages that arrive after the editor closed.

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

Double-click **Buy milk** to open the editor. **Enter** saves the title and **Escape** discards it. Both close the editor and show the hint again.

## Keep the logic in a Program

`Program.make` puts a feature's Model, Message union, `init`, `update`, and Subscriptions in one value, with no React import. The field names match Foldkit's `Runtime.makeApplication`. So the same module runs in React, in a Store, in Foldkit Story tests, and later in a Foldkit app with a view.

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

Pass the Program to `Application.define`. React-only options and `resources` go in the second argument. The Program has an `init`, so the Provider needs no `init` prop. Pass one only to replace it, for example with data from the server.

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

A child Program declares an `OutMessage` union and usually no `init`, since its parent creates the child's Model. Pass it to `Submodel.define` to get its hooks.

## Find your way around

| Folder | What it holds |
| --- | --- |
| `packages/react-foldkit` | The library, its ESLint plugin, its tests, and the project-cache example |
| `apps/web` | The docs site, built with React Foldkit. Its demos live under `/examples` |
| `packages/ui` | Components and theme shared by the site |
| `repos/foldkit`, `repos/effect` | Upstream source, for reference only. The build ignores it. |

To contribute, read [how the runtime works](packages/react-foldkit/docs/architecture.md), [how to verify changes](docs/verification.md), [how to release](docs/releasing.md), and [the writing guide](docs/writing.md).
