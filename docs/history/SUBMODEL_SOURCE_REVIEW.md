# Submodel source review

Child Providers read projections of one root store. Equal selections skip
store-driven renders. The root owns state, update, Commands, and Subscriptions.

## API

- Child Providers take `source` instead of `model`/`dispatch`.
- Root and child definitions expose `useSubmodel({ read, toParentMessage })`.
  Creating a projection does not subscribe the parent view.
- `useOptionalSubmodel` observes presence and returns an Option source.
  Reads and Messages carry instance IDs; recreated children get fresh IDs.
- Projections cache by parent snapshot identity. Live and server caches stay separate.
- Context uses Option; selector equality defaults to `Equal.equals`. Root and
  child hooks share React's external-store selector helper. Missing context throws.

See [the submodel spec](REACT_SUBMODEL_API_SPEC.md) for examples and contracts.

## Fixed findings

| Priority | Problem                                                         | Fix                                                                         |
| -------- | --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| P2       | Detached callbacks lost `this`.                                 | Forwarding callbacks preserve receivers; tested through source replacement. |
| P2       | Server reads could overwrite a departing child's live snapshot. | Separate retention caches; a scoped regression covers the failure.          |

The review covered queues, source lifecycles, routing, SSR/hydration, public types,
projections, and examples. No actionable findings remained. Query settlement was
implemented later; the Foldkit backport remains deferred.

## Tests

- `src/react.submodel.test.tsx`: 11 composition tests using a shared real-store
  fixture; selectors, equality, abandoned renders, nested/optional children,
  lifecycle cleanup, and stale work.
- `src/internal/model-source.test.ts`: server/live retention regression with
  `it.effect` and scoped cleanup.
- `test/types/react.submodel.test.ts`: emitted API checks. Root configuration
  checks live in `test/types/react.test.ts`.
- Router, hydration, and browser tests cover separate paths. Removed obsolete
  prop/context tests and duplicate SSR cases.

Tests use `Effect.yieldNow`, MutableList, Layer, and Deferred. The native Promise
implements React's Suspense protocol.

## Recorded verification

- **169 runtime tests across 17 files** and **two Chromium tests**.
- Package/web typechecks, ESM/declaration build, emitted API checks, and ESLint.
- Built React entry imports in Node; `git diff --check` is clean.
- One existing unused-disable lint warning; no errors.

Chromium covers client scheduling; Happy DOM covers SSR/hydration. Equal selections
skip source-driven renders, but parent/prop/state/context changes can still render
consumers. Other adapters need timing tests.
