# Changelog

## Unreleased

- KeyedQuery `args` are `Schema.Codec` fields. Omit `toKey` to JSON-encode args (`Schema.toCodecJson`, `Schema.fromJsonString`). Slot key and Interrupt identity share `toKey`.
- `query.lift` returns a child record (`fold`, policies, `watchSubscription`). Bind it as `postsChild`. A `Got*` handler calls `postsChild.fold(model)`. That fold takes `{ message }`, the same fields as `query.ParentMessage`. `query.ParentMessage` is `{ message: query.Message }` for a parent `Got*` case. Field `lift<Model, Message>()({ field, parentMessage })` takes a `Got*` constructor (`Message.GotPostsMessage`). Name the parent Message so the handle is the full union. A `read` / `write` lens still infers the parent Model and takes Foldkit's `(childMessage) => parentMessage` mapper.
- Add `Query.run` (Query: settled `Effect`; KeyedQuery: `run(args) => Effect`). Remove `Query.ensure` and `lift.ensure`.
- `ReactFoldkit.make` takes a flat `Store.Config` plus `Model: Schema.Codec`. Add `Seed` for pre-activate Model writes (`Schema.toEquivalence` skips equivalent Models). `Provider` is init-only (remove `store` / `fromLive`). `layer` is `NoInfer`'d from `update`, so `Layer.empty` is not accepted when Commands require services.
- Keep `Query.informWatch` / `informForget` and `Query.watchSubscription`. KeyedQuery slots store `{ args, data }` so watch-drop Interrupts pending fetches. Late `SettledFetch` after forget is a no-op.
- Add `Store.takeWhen` and `Store.Disposed`.
- `Query.HttpApi.Service.query` returns `Query.Query` or `Query.KeyedQuery`.
- Add the `API Cache (Query)` example next to the hand-rolled API Cache screen.

Breaking alignment with Foldkit `0.158.2` and Effect `4.0.0-rc.112`.

- `Update.Return` is `{ model, commands?, outMessage? }`. Empty commands are omitted; `Command.none` is gone.
- Messages are declared with `defineMessageUnion` from `react-foldkit/message`. The `m` helper is gone.
- Interruptible command outcomes are `Interruptible.Outcome.Interrupted()` / `NotFound()`.
- Nested child updates use `Update.foldChild`. The `react-foldkit/submodel` export is gone.
- Node engines are `>=20.19.0`.

## 0.1.0

First publishable cut of `react-foldkit`.

- React `Provider` / `useModel` / `useDispatch` over a Foldkit-style store
  (boot barrier, drain budget, crash terminality, interrupt registry, Scope teardown)
- Reexported Foldkit TEA surfaces: Command, Message, Update, Struct, Schema, AsyncData,
  Subscription (`make` / `entry`)
- ESLint presets: `react-foldkit/eslint` (`recommended` + `strict`)
- Examples in the monorepo `apps/web`: Todo (AsyncData) and Stopwatch (Subscription)

Foldkit is a regular dependency behind the `react-foldkit/*` facade; apps must
not import it directly. See `THIRD-PARTY-NOTICES.md`.
