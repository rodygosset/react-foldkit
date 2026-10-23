---
"react-foldkit": minor
---

Rename the public Store `Program` type to `RuntimeProgram` to distinguish the Store runtime contract from the schema-bearing `Program.Program` type.

Replace `Store.Program<Model, Message>` with `Store.RuntimeProgram<Model, Message>` when importing the Store namespace from `react-foldkit` or `react-foldkit/store`. Replace named type imports of `Program` from `react-foldkit/store` with `RuntimeProgram` and update their usages. The old Store type name is removed. `Program.Program` and `Program.make` are unchanged.
