---
"react-foldkit": minor
---

Add `useSend`, optional child Providers, application `init`, and `Program.make`.

- `useSend()` on applications and Submodels returns one function per Message tag: `send.ChangedTitle({ title })` builds the Message with the union's constructor and dispatches it. `send(message)` dispatches a Message you already built.
- A Submodel Provider accepts `optionalLift` and `fallback` for a child stored in an `Option`. It renders its children while the child is present and `fallback` while it is absent.
- `defineApplication` accepts an `init`. A Provider without an `init` prop starts from it; a Provider `init` prop replaces it.
- `Program.make` from `react-foldkit/program` groups a feature's Model, Message union, `init`, update, and Subscriptions without React. Spread an application Program into `defineApplication` or `Store.boot`, and pass a child Program to `Submodel.define`.

Breaking changes:

- `defineApplication` requires the Message union: `defineApplication({ Model, Message, update })`. Any Schema for the Messages works, such as `Schema.Finite` for numeric Messages.
- `Submodel.define` takes the child Model Schema and Message union instead of type parameters. Replace `Submodel.define<Model, Message>()` with `Submodel.define({ Model, Message })`.
