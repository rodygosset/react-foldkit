# Changelog

## Unreleased

- Backport the latest Foldkit Query lifecycle: Model instance and request IDs, stale completion rejection, direct policy functions, full-set watch reconciliation, and opt-in Fetch interruption. `init` now takes an instance ID and `read` accesses the wrapped `AsyncData`. Parent `Got*` cases use `{ message: query.Message }` with `toParentMessage` in `lift`.
- Backport the latest `Query.HttpApi.Service.query` endpoint derivation and serializable HTTP client errors.


- Add `Query.run` (Query: settled `Effect`; KeyedQuery: `run(args) => Effect`). Remove `Query.ensure` and `lift.ensure`.
- `ReactFoldkit.make` takes a flat `Store.Config` plus `Model: Schema.Codec`. Add `Seed` for pre-activate Model writes (`Schema.toEquivalence` skips equivalent Models). `Provider` is init-only (remove `store` / `fromLive`). `layer` is `NoInfer`'d from `update`, so `Layer.empty` is not accepted when Commands require services.
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
