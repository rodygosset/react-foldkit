# Give child Programs their own hooks

A Submodel is Foldkit's way to split a feature into a parent and a child. The child has its own Model, Messages, and `update`, and the parent keeps the child's Model in one of its fields. A child reports events to its parent with an OutMessage. [Foldkit's Submodel guide](https://foldkit.dev/core/submodel) explains the pattern.

React Foldkit adds hooks for the child. The child's React components read and update only their part of the parent's Model, through `Submodel.define`. The child shares the parent's Provider and Store, so it has no state of its own outside the parent's Model.

## Connect a child to its parent

This form keeps a draft and tells its parent when someone submits it. The Model, Messages, OutMessage, and `update` are plain Foldkit. `Submodel.define` gives the form its own `Provider` and hooks:

```tsx
// form.tsx
import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"
import type * as Update from "foldkit/update"
import * as Submodel from "react-foldkit/submodel"

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
    ClickedSubmit: () =>
      model.draft.trim() === ""
        ? { model }
        : {
            model: modifyFields(model, { draft: () => "" }),
            outMessage: OutMessage.Submitted({ text: model.draft.trim() }),
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

In the parent, `Submodel.lift` connects the child to the parent's `form` field. It wraps the child's Messages for the parent and runs the child's `update`, including its OutMessage. The child's `Provider` takes the parent application in `from` and the lift in `lift`:

```tsx
// App.tsx
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

function TodoList() {
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
      <TodoList />
    </Todos.Provider>
  )
}
```

Declare a lift once, outside render. A lift created during render gives the child a new source each time, so its components subscribe again on every render. The `no-inline-submodel-lift` rule in [`react-foldkit/eslint`](../eslint/README.md) warns about it.

## Show a child that exists only some of the time

Some children exist only part of the time, such as an editor that opens on double-click. Keep the child's Model in an `Option` field, and pass the child's `Provider` an `optionalLift` in place of `lift`. The Provider renders its children while the field is `Some`, and `fallback` while it is `None`:

```tsx
const editing: Submodel.OptionalProjection<Model, Message, Editor.Model, Editor.Message> = {
  read: (model) => model.editing,
  toParentMessage: (message) => Message.GotEditorMessage({ message }),
}

function TodoList() {
  return (
    <Editor.Provider
      from={Todos}
      optionalLift={editing}
      fallback={<p>Double-click a todo to rename it.</p>}
    >
      <Editor.View />
    </Editor.Provider>
  )
}
```

The parent opens the editor by setting `editing` to `Some`, and closes it by setting `None`. Because Messages can still arrive after the editor closed, the parent's `update` ignores editor Messages while `editing` is `None`.

## Child Programs with `Program.make`

A child Program declares an `OutMessage` union and usually no `init`, because its parent creates the child's Model. Build it with `Program.make`, and pass it to `Submodel.define` to get its hooks. The same child Program then works in Foldkit when the feature moves, as [Move to Foldkit](moveToFoldkit.md) describes.
