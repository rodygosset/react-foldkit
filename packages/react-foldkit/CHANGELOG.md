# Changelog

## 0.1.0

First publishable cut of `react-foldkit`.

- React `Provider` / `useModel` / `useDispatch` over a Foldkit-style store
  (boot barrier, drain budget, crash terminality, interrupt registry, Scope teardown)
- Vendored TEA surfaces: Command, Message, Update, Struct, Schema, AsyncData,
  Submodel, Subscription (`make` / `entry`)
- ESLint presets: `react-foldkit/eslint` (`recommended` + `strict`)
- Examples in the monorepo `apps/web`: Todo (AsyncData) and Stopwatch (Subscription)

Foldkit remains an implementation detail bundled into `dist/`; apps must not
import `foldkit` directly. See `THIRD-PARTY-NOTICES.md`.
