# REE TODO

Outstanding work for `@workspace/ree` before (or while) growing past the core loop.

## 1. Lint rules — block anti-patterns

Create ESLint (or custom) rules so agents/humans cannot reintroduce escape hatches around the REE loop.

Candidates to forbid or restrict:

**Routing / URL**

- `useNavigate` / `router.navigate` / `history.push` outside Command `execute` (and the URL bridge module allowlist)
- `useSearch` / `useParams` outside the URL bridge / route modules

**Effects & local state**

- `useState` / `useReducer` for domain state inside REE feature views (allowlist purely local UI ephemera if needed)
- Direct `Store.dispatch` imports bypassing hooks? (maybe warn)
- Calling `Effect.run*` inside React components / `update` (effects belong in Commands)
- `useSyncExternal`-style effects that mirror URL/props into Messages on every change (seed via Provider `init` / Flags; ongoing external streams belong in Subscriptions later)

**Submodels / composition**

- Nested `Store.make` / extra `Provider` for feature composition (one Store per app/feature root; children are Model fields + `Submodel.delegate`, not new stores)
- Child views calling parent `useDispatch` / importing parent Message constructors (child receives `dispatch: (ChildMessage) => void` props only)
- Parent update that mutates a child slice without going through the child's `update` (must `delegate` or call `Child.update` + `Command.mapMessages`)
- Child modules importing parent Message types / wrapping themselves into parent Messages (wrapping is the parent's job via `wrap`)

Deliverable: a small `@workspace/ree/eslint-plugin` (or rules under `packages/ree`) wired into `apps/web`.

## 2. Investigate — Subscriptions

Foldkit-style model-gated subscriptions: declare a Stream (or teardown pair) keyed by a Model slice; runtime starts/stops when the slice changes; emissions become Messages.

Questions to answer:

- API shape (`subscriptions(model) => …` vs declarative list)
- How this sits next to TanStack / browser events without React owning the lifecycle
- Equality / keying for “slice changed”
- Overlap with the URL bridge (is URL a special subscription?)

## 3. Investigate — Command interruption

Foldkit Commands can be interruptible (in-flight HTTP, uploads). Sketch how REE would:

- Track running fibers / abort handles per Command invocation
- Decide interrupt policy from Model (or explicit Cancel Messages)
- Interact with `dispose` on the Store
- Stay typed (`Effect` interruption vs `AbortSignal`)

No implementation until the investigation picks a minimal first cut.
