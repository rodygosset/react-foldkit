# react-foldkit TODO

Outstanding work for `@workspace/react-foldkit` before (or while) growing past the core loop.

## 1. Lint rules — block anti-patterns

Create ESLint (or custom) rules so agents/humans cannot reintroduce escape hatches around the TEA loop.

Candidates to forbid or restrict:

**Routing / URL**

- `useNavigate` / `router.navigate` / `history.push` outside Command `execute` (and the URL bridge module allowlist)
- `useSearch` / `useParams` outside the URL bridge / route modules

**Effects & local state**

- `useState` / `useReducer` for domain state inside feature views (allowlist purely local UI ephemera if needed)
- Direct `Store.dispatch` imports bypassing hooks? (maybe warn)
- Calling `Effect.run*` inside React components / `update` (effects belong in Commands)
- `useSyncExternal`-style effects that mirror URL/props into Messages on every change (seed via Provider `init` / Flags; ongoing external streams belong in Subscriptions later)

**Submodels / composition**

- Nested `Store.boot` / extra `Provider` for feature composition (one Store per app/feature root; children are Model fields + `Submodel.delegate`, not new stores)
- Child views calling parent `useDispatch` / importing parent Message constructors (child receives `dispatch: (ChildMessage) => void` props only)
- Parent update that mutates a child slice without going through the child's `update` (must `delegate` or call `Child.update` + `Command.mapMessages`)
- Child modules importing parent Message types / wrapping themselves into parent Messages (wrapping is the parent's job via `wrap`)

Deliverable: a small `@workspace/react-foldkit/eslint-plugin` (or rules under `packages/react-foldkit`) wired into `apps/web`.

## 2. Investigate — Subscriptions

Foldkit-style model-gated subscriptions: declare a Stream (or teardown pair) keyed by a Model slice; runtime starts/stops when the slice changes; emissions become Messages.

Questions to answer:

- API shape (`subscriptions(model) => …` vs declarative list)
- How this sits next to TanStack / browser events without React owning the lifecycle
- Equality / keying for “slice changed”
- Overlap with the URL bridge (is URL a special subscription?)

## 3. Command interruption — done in store

Store now provides Foldkit’s per-instance interrupt registry and forks Commands
into a Scope that `dispose` interrupts. App-level patterns (when to return
`Definition.Interrupt` from update) still follow Foldkit docs.
