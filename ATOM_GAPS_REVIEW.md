# Commit/source review

Reviewed changes against `b9e87c128c` for correctness, security, and maintainability.
No actionable findings remained after these fixes.

## Fixed findings

| Priority | Problem                                                            | Fix                                                                            |
| -------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| P2       | Cleanup could hide the setup failure.                              | Effect/Scope preserves both failures in the Cause; checked with `runSyncExit`. |
| P2       | Passing `getSnapshot` directly to `Effect.sync` lost its receiver. | Call `source.getSnapshot()` inside the thunk; added a regression test.         |
| P2       | Queue pressure could target the wrong match notification.          | Target the accepted revision; assert the edit is still queued before delivery. |

Lifecycle tests caught two incorrect Option guards. Failed deliveries now retry
without replaying earlier successful entries.

## Design

- Commit and source validation return Result. `Store.commit(store, message)`
  wraps the same FIFO queue in a lazy Effect.
- Effect/Scope handles acquisition, rollback, and release. React/source callbacks
  run synchronously; render contract violations throw.
- `runSync` throws the first failure; `runSyncExit` exposes the full Cause,
  including setup and cleanup failures.
- Reentrant commits do not enqueue. Failed deliveries do not acknowledge tokens.
- At this stage, router compatibility stayed in fixtures/app code. Published
  declarations compiled without TanStack augmentation.

## Test cleanup

Removed the discarded adapter, duplicate cases, and implementation-only assertions.
Moved four reconciliation tests to Node. Unit tests stay beside their modules;
shared fixtures, integration/browser tests, and consumer type tests live in `test/`.

Type tests check emitted exports with `expectTypeOf` and `@ts-expect-error`.
SSR isolation renders different Models through one shared app definition.

## Recorded verification

Passed: **159 tests across 15 files**, two Chromium tests, package typecheck,
ESM/declaration build, and consumer type checks. Transport/hydration passed in
Happy DOM. The existing unused Foldkit import warning remained.

Later work added submodel bindings and Query settlement; see
[validation](COMMIT_SOURCE_VALIDATION.md). Loader services return lazy Effects,
use Deferred in tests, and receive the router abort signal. Source validation
returns `CommitSourceError`; callback defects remain in the Cause.

Other adapters need timing tests. Reconnection reads the latest snapshot, not
missed events. Update owns freshness; the Foldkit backport is deferred.
