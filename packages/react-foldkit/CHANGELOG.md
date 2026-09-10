# Changelog

## Unreleased

- Add `Query.run` (Field: settled `Effect`; Keyed: `run(args) => Effect`). Remove `Query.ensure` and `foldChild.ensure`.
- `ReactFoldkit.make` takes `Store.Config` plus `Model: Schema.Codec`. Add `Seed` for pre-activate Model writes (`Schema.toEquivalence` skips equivalent Models). `Provider` is init-only (remove `store` / `fromLive`). `Store.Config.make` constructs a `Store.Config`.
- Keep `Query.informWatch` / `informForget` and `Query.watchSubscription`. Keyed slots store `{ args, data }` so watch-drop Interrupts pending fetches. Late `SettledFetch` after forget is a no-op.
- Add `Store.takeWhen` and `Store.Disposed`.
- Add `Query.define`: a remote-data Submodel factory. The child owns `AsyncData` transitions, settle, in-flight dedup, and interrupt-then-reload. The parent folds `Got*` and drives loads with `foldChild` Steps (`loadIfMissing`, `revalidate`, `revalidateOrLoad`, `replace`, `watch`, `forget`). `Query.define` returns `Query.Field` or `Query.Keyed`. `foldChild` returns `Query.Fold.Field` or `Query.Fold.Keyed`. Keyed `Fetch` is `Command.Interruptible.DefinitionWithArgs`. Keyed `inform*` is `Update.Fold`.
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
