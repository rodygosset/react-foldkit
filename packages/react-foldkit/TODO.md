# react-foldkit TODO

Outstanding work for `@rodygosset/react-foldkit`. Credit for the TEA vocabulary and runtime contracts belongs to [Foldkit](https://github.com/foldkit/foldkit). This package is a React-shaped binding over that design.

---

## Status

| Area | State |
|------|--------|
| Store (drain, boot, crash, Scope, interrupts) | Done |
| Command / Message / Update / Struct / Schema / AsyncData / Submodel | Done (vendored Foldkit surfaces) |
| React Provider + hooks | Done |
| ESLint recommended + strict presets | Done — `@rodygosset/react-foldkit/eslint` |
| Subscriptions + stopwatch example | Done |
| Public share (license, docs, CI, publish) | Mostly done — pin story + remote/CONTRIBUTING open |

---

## 1. Subscriptions + stopwatch example — done

- `Subscription.make` / `entry` vendored; `Store.Config.subscriptions` wired (`Stream.concat` init seed, `changesWith`, `switchMap`)
- Tests: init seeding / start / stop / restart / equivalence / dispose (`store.subscription.test.ts`)
- Example: `apps/web/src/stopwatch.tsx` at `/stopwatch` (landing link added)
- Skipped for later: `persistent` / `aggregate` / `lift` / `fromEvent`, URL-as-subscription

---

## 2. Lint rules (decided + shipping)

### 2.1 Decisions (grill)

| Topic | Decision |
|-------|----------|
| Ship shape | Flat ESLint config export from the **same** package: `@rodygosset/react-foldkit/eslint` |
| Presets | **`recommended`** (errors, CI fails) + optional **`strict`** (warnings by default) |
| Recommended rules | navigate outside Commands · nested `Store.boot` / Provider-in-View · `Effect.run*` in views/update · child↔parent Message / hook leaks |
| Strict rules | `useState` / `useReducer` in View `*.tsx` (and similarly named view functions) |
| Allowlists | Preset globs for URL bridge, store internals, tests, `packages/ui`, generated · rule overrides in consumer config for app bridges · comment disables rare + reasoned |
| Agents | Rules-only (no Cursor rule / AGENTS for now) |
| View scope (strict) | View-named files (`View*.tsx`, `*View.tsx`, …) and `View` / `*View` functions |

Guidance for consumers: prefer adding a path to `urlBridgePaths` (or similar settings) over `eslint-disable`. If you need a disable, you probably need a new glob.

### 2.2 Rule IDs

**Recommended (error)**

- `react-foldkit/no-navigate-outside-commands`
- `react-foldkit/no-nested-store`
- `react-foldkit/no-effect-run-outside-commands`
- `react-foldkit/no-store-hooks-in-child-view`

**Strict (warn)**

- `react-foldkit/no-domain-use-state`

### 2.3 Deliverable layout

```
packages/react-foldkit/eslint/
  src/              # TypeScript sources (index, plugin, utils, rules)
  dist/             # tsup output — package export `./eslint`
  README.md         # install + presets + settings
```

Wire `apps/web/eslint.config.js` to spread `recommendedConfig` (and optionally `strictConfig`).

**Shipped:** `packages/react-foldkit/eslint/` + `./eslint` export; `apps/web` uses `recommendedConfig` with `urlBridgePaths` for router / todo-search / routes.

---

## 3. Public share checklist

1. **Respect Foldkit’s license** — **Done:** `LICENSE`, `THIRD-PARTY-NOTICES.md`, README credits; included in `package.json` `files`.
2. **Attribute merit to Foldkit** — **Done (README):** Credits + “not Foldkit” relationship section.
3. **Short docs markdown** — **Done:** package README (mental model, never import `foldkit`, surface table, ESLint).
4. **LICENSE** — **Done** at package root.
5. **Real package name + versioning + CHANGELOG** — **Done:** `@rodygosset/react-foldkit@0.1.0`, `CHANGELOG.md`.
6. **Drop `private: true` / publish from `dist`** — **Done:** exports + `files` point at `dist` / `eslint/dist`; `prepack` builds.
7. **CI** — **Done:** `.github/workflows/ci.yml` (build, typecheck, test, lint, web build, pack dry-run).
8. **Publish boundary** — **Done:** tarball is package `files` only (no `repos/foldkit` / `repos/effect`).
9. **Foldkit pin story** — how vendored relative source is updated / attributed. *(open)*
10. **Consume `dist` from `apps/web`** — **Done:** no `src` path override; workspace dep resolves package exports → `dist`.
11. **Git remote + CONTRIBUTING** as needed. *(open)*


---

## 4. Command interruption — done

Store provides Foldkit’s per-instance interrupt registry and forks Commands into a Scope that `dispose` interrupts.
