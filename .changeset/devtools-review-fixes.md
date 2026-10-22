---
"react-foldkit": minor
---

Require tagged Messages in application, Program, and Submodel constructors. Replace primitive or untagged Messages with a union from `defineMessageUnion`. The DevTools dispatch Schema must also match the application's Message type. A `Program` annotation names the Schemas, so `Program<Model, Message>` becomes `Program<typeof Model, typeof Message>`. `Store.make` and `Store.boot` accept untagged Messages.

Keep history navigation working with small limits and remove disconnected browser runtimes from the agent connection list.
