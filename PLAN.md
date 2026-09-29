# Atom gaps: implementation plan

Goal: keep one app-wide Foldkit Model and Provider while allowing independently
defined submodels and TanStack route loader data to appear on a page's first
render. The agreed API sketches are in `REACT_SUBMODEL_API_SPEC.md` and
`ROUTE_LOADER_API_SPEC.md`. Both are proposals; no implementation is present.

## 1. Prove the route handoff first

Build a minimal integration fixture with the real TanStack Router and
ReactFoldkit store. Record the Model read by the destination component on its
**first render**, not just the final DOM. Verify a completed loader result is
visible there after client navigation, including with a busy store queue.
Verify preloads, canceled navigations, revalidation, and repeated matches do
not commit the wrong result. In an SSR/hydration fixture, verify server HTML,
the first client Model, and the first client render agree after loader data is
serialized and restored. Use a fresh router and store per server request.

Test whether `onBeforeRouteMount` plus a synchronous Message transition
actually supplies the required boundary. If it does not, revise the boundary
before implementing public APIs. Do not use a page effect, render-time store
mutation, or `<Seed />` for this handoff.

## 2. Implement the ReactFoldkit and Query APIs

- Add child-first `ReactFoldkit.defineSubmodel`: an independent child definition
  with typed `Scope`, `useModel`, and `useDispatch`. `Scope` is view context only;
  the app's single Provider owns all state, update, and Commands. Preserve
  ordinary `Update.foldChild` composition and handle optional/keyed children.
- Add `query.settle(model, result)` and
  `keyedQuery.settle(model, args, result)`, plus matching `query.lift(...).settle`
  steps. They take the current public `AsyncData` type; Success/Failure settle
  the slot, invalidate older Fetches, and optionally interrupt a pending Fetch.
  Other states leave the slot unchanged. Reuse `query.Model.fields.data` as the
  Message field Schema; do not add a duplicate schema.
- Add only the host-level synchronous Message-delivery primitive proved by
  step 1 (provisionally `useCommit`). Specify ordering against queued Messages
  and preserve the normal `update`/Command path. Keep router-specific mapping
  in app code. Initial loader data enters through `Provider init`; later route
  data enters as an app Message. The app owns the route Message envelope.

## 3. Backport the core-worthy pieces to Foldkit

Backport `Query.settle` and its lifted forms to the separate Foldkit repo if
their general value is confirmed (for example, installing the authoritative
value returned by a save Command while an older GET is in flight). Keep React
view hooks, Provider/store delivery, and TanStack handoff in ReactFoldkit or
the app; they are not Foldkit core APIs. Run the relevant type and behavior
tests in both repos and keep the public contracts aligned.

## Done when

The two route guarantees pass with real router/store integration; the search
example typechecks using one root Provider; submodel views work under any
parent that embeds them; Query request identity survives externally settled
results; and the Foldkit backport contains only host-independent APIs.
