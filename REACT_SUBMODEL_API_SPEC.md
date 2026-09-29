# React Submodel View API (proposal)

## Goal

Let a reusable Submodel define a React view with its own `useModel` and
`useDispatch` hooks. The Submodel must not know which parent embeds it. Each
parent owns the child Model, wraps child Messages, and folds the child's update,
as it does with Foldkit's `h.submodel`.

This API is proposed, not implemented.

## Example

The child module defines its Model, Message, update, and view without importing
the parent:

```tsx
// settings.tsx
export const Settings = ReactFoldkit.defineSubmodel({
  Model: SettingsModel,
  Message: SettingsMessage,
  update: updateSettings,
})

export function SettingsView() {
  const model = Settings.useModel()
  const dispatch = Settings.useDispatch()

  return (
    <button onClick={() => dispatch(SettingsMessage.ClickedSave())}>
      {model.label}
    </button>
  )
}
```

The parent embeds that child and chooses how its Messages enter the parent
update:

```tsx
// parent.tsx
const foldSettings = Update.foldChild({
  update: Settings.update,
  read: (model: Model) => Option.some(model.settings),
  write: (model, settings) => ({ ...model, settings }),
  toParentMessage: (message) => Message.GotSettingsMessage({ message }),
})

const update = (model: Model, message: Message) =>
  Message.match(message, {
    GotSettingsMessage: ({ message }) => foldSettings(model, message),
    // Other parent Messages are handled here.
  })

function ParentView() {
  const model = Parent.useModel()
  const dispatch = Parent.useDispatch()

  return (
    <Settings.Scope
      model={model.settings}
      dispatch={(message) => dispatch(Message.GotSettingsMessage({ message }))}
    >
      <SettingsView />
    </Settings.Scope>
  )
}
```

Another parent can render the same `SettingsView` with a different Model field
and a different Message wrapper. A child can also embed another Submodel by
using its own hooks as the parent hooks at the next level.

## Contract

- `defineSubmodel` creates a typed view context and exposes `Scope`, `useModel`,
  `useDispatch`, and the child `update`. It does not create a separate store.
- `Scope` supplies the current child Model and a child Message dispatcher to
  descendants. It does not call update, run Commands, or change the Model.
- `useModel` and `useDispatch` work only beneath the matching `Scope`. A clear
  error is raised if they are used outside it.
- The parent remains responsible for storing the child Model and using
  `Update.foldChild` to process child Messages and lift child Commands.
- Repeated or optional children use an identity in the parent wrapper Message.
  The parent's `read` returns `Option.none` after removal, so late child Messages
  do not revive a removed instance. The view mounts `Scope` only while that
  child exists.
- Query remains an ordinary child Submodel within this structure. Mounting a
  `Scope` does not implicitly fetch; query demand is expressed through Model
  transitions and Subscriptions.

## Deferred design decisions

Before implementing the repeated-child form, specify how a keyed `Scope`
reacts when its child disappears, including stale event handlers and pending
Command results. A parent-side convenience that shares configuration between
`Scope` and `Update.foldChild` may follow, but the child definition must remain
independent of every parent.
