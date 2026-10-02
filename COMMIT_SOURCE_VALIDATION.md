# Commit and source validation

Validated `Store.commit`, `useCommit`, and `useCommitSource` with production APIs,
scalar tokens, and one persistent root Provider.

## Recorded results

- **177 tests across 18 files** and **two Chromium tests** passed.
- Package typecheck, ESM/declaration build, and emitted API type tests passed.
- Consumer type tests reject invalid Messages/Models, projections, selectors,
  keys/tokens, async sources, settlement arguments, and missing services.
  They use emitted exports, without source imports or router augmentation.

| Contract                                                                          | Coverage                                                   |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| FIFO through the commit's queue entry, including repeated Message references      | 12 store tests                                             |
| Later scheduling, obsolete callbacks, asynchronous Commands                       | Store tests                                                |
| Reentrant, inactive, crashed, and disposed failures; retained crash Cause         | Store and React lifecycle tests                            |
| Bootstrap, duplicate suppression, ordering, observed removal/re-entry             | Source tests and 11 public-hook tests                      |
| Activation, connection gaps, immediate notifications, stale callbacks             | Hook and lifecycle tests                                   |
| Successful tokens kept across Strict Mode/Activity reconnects                     | Hook and browser tests                                     |
| Cleanup after setup/delivery failures; retry without replaying successful entries | 11 Node source tests and Scope lifecycle tests             |
| Typed Results, lazy commit, combined setup/cleanup Causes                         | Store/type tests and `runSyncExit` assertions              |
| Navigation/revalidation first renders with queued work                            | Real router and Chromium tests                             |
| Preloads, canceled destinations, cached return, settled failures                  | Router integration tests                                   |
| Equivalent server/client Models and tokens                                        | Two transport/hydration tests and shared-app SSR isolation |

Chromium uses the native clock and MessageChannel. A slow update exceeds the
5 ms budget; an edit stays queued until accepted loader data arrives. The first
render includes both. Strict Mode keeps one connection and the root mounted.
Controlled drains do not deliver data.

Happy DOM tests use `createRequestHandler`, generated transport scripts, `hydrate`,
and `hydrateRoot`. They check equivalent Models/tokens, restored Dates, and no
hydration errors or refetches. A Node test renders different Models through one
app definition to detect shared request state. Chromium covers client scheduling.

## Implementation

- Each commit gets a unique `MutableList` entry and bypasses the drain budget
  through it. Commands stay asynchronous; later Messages keep normal scheduling.
- Provider activation owns a Scope; connections use child scopes. Hooks can
  register before activation without losing catch-up Messages.
- Commit and source validation return Result; the commit Effect is lazy.
  Lifecycle/reconciliation use Effect; callback exceptions become defects.
  `runSync` throws the first failure; Effects retain the complete Cause.
- HashMap tracks successful key/version pairs. Validate duplicates before
  delivery, subscribe before rereading, and ignore disconnected callbacks.
- Update determines Message types. At this stage, TanStack Readable compatibility
  used a fixture-local type augmentation.

The router fixture reads Search through child Providers/hooks and settles
`Query.run` through the lifted API. Tests cover old requests, delayed cancellation,
sibling/optional isolation, ignored non-outcomes, and good data kept on failure.
Settlement reuses Query's AsyncData Schemas and needs no fetch services.

`LoaderApi.load` returns `Effect<SearchResponse, string>`. Deferred and `Effect.fail`
control responses. The router uses `Effect.runPromise` with its abort signal;
integration tests cover router abort and Query Fetch interruption.

## Limits

Tested: TanStack React Router **1.170.33**, router-core **1.171.28**, react-store
**0.9.3**. Other adapters/versions need timing tests. First-render delivery requires
synchronous publication of accepted values.

Reconnects see the latest snapshot, not missed values or identical removal/re-entry
while disconnected. Update owns relevance/freshness. The Foldkit backport is deferred.

## Test layout

| Location                                                | Purpose                                                                |
| ------------------------------------------------------- | ---------------------------------------------------------------------- |
| Beside source modules                                   | Unit tests; source reconciliation runs without React                   |
| `test/integration/route-loader*.test.tsx`               | Router navigation and SSR/hydration                                    |
| `test/fixtures/`                                        | Shared fixtures and TanStack type compatibility                        |
| `test/browser/route-loader.test.tsx`                    | Navigation/revalidation with the native browser scheduler              |
| `test/types/{react,react.submodel,query,store}.test.ts` | Emitted API checks using `expectTypeOf` and compile-only invalid calls |

Removed the mount adapter, duplicate tests, expected failures, and implementation-only
assertions. Four delivery tests moved to Node; lifecycle tests caught two bad Option
guards. SSR isolation uses one shared app definition.

## Run the checks

From `packages/react-foldkit`:

```sh
bun run test
bun run typecheck
bun run build
bun run test:types:package
bunx playwright install chromium
bun run test:browser
```

Install Chromium once; use `--with-deps` on Linux CI. For a visible browser,
run `bun run test:browser --browser.headless=false`.

Browser tooling is development-only and excluded from the published package.
