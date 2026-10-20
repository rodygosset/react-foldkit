---
"react-foldkit": minor
---

Add `Application.define`, `useSend`, optional child Providers, Program `init`, and `Program.make`.

- `useSend()` on applications and Submodels returns one function per Message tag: `send.ChangedTitle({ title })` builds the Message with the union's constructor and dispatches it. `send(message)` dispatches a Message you already built.
- A Submodel Provider accepts `optionalLift` and `fallback` for a child stored in an `Option`. It renders its children while the child is present and `fallback` while it is absent.
- A Program can carry an `init`. A Provider without an `init` prop starts from it; a Provider `init` prop replaces it.
- `Program.make` from `react-foldkit/program` groups a feature's Model, Message union, `init`, update, and Subscriptions without React. Pass an application Program to `Application.define` or `Store.boot`, and a child Program to `Submodel.define`.

Breaking changes:

- `defineApplication` from `react-foldkit/react` is now `Application.define` from `react-foldkit/application`, and the root `ReactFoldkit` namespace is now `Application`. It takes the Program first and React options second. Replace `defineApplication({ Model, update, resources, retainInactive })` with `Application.define({ Model, Message, update }, { resources, retainInactive })`. Program fields are `Model`, `Message`, `init`, `update`, and `subscriptions`; every other field moves to the options. The options argument is required when the Program needs services.
- The Program requires the Message union. Any Schema for the Messages works, such as `Schema.Finite` for numeric Messages.
- The `Config` type is replaced by `Options`, which holds only the React options.
- `Submodel.define` takes the child Model Schema and Message union instead of type parameters. Replace `Submodel.define<Model, Message>()` with `Submodel.define({ Model, Message })`.
