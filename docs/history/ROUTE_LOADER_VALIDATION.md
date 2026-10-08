# Route loader validation

Commit/source APIs and child hooks expose accepted loader data on the first
navigation and revalidation renders.

## Recorded coverage

Passed: **10 route tests** (eight client, two SSR/hydration), six Query settlement
tests, a shared-app Node SSR isolation test, and two Chromium scheduling tests.

- One persistent root Provider delivers data through a projected Search Provider
  before the page renders, including with queued edits.
- Preloads leave the Model untouched. Entering a cached result delivers it;
  canceled destinations do not. Cached return preserves application edits.
- Revalidation results and settled failures appear immediately; Strict Mode
  keeps one delivery connection.
- Real TanStack transport and `hydrateRoot` produce equivalent initial Models,
  stable tokens, correct HTML, restored Date values, and no hydration errors or
  client refetch. SSR/hydration runs in Happy DOM.

Queue-pressure tests target the accepted revision and check that the edit is
still queued before delivery. Provider `commitSource` and commit deliver the data.
Chromium uses the native clock/MessageChannel and checks that the root stays mounted.

## Integration boundary

At this stage, the fixture decoded successful published matches and preserved
one scalar token per loader result. A fixture-local type augmentation supplied
TanStack's Readable interface; production exports had no router imports.

Tested: react-router **1.170.33**, router-core **1.171.28**, react-store **0.9.3**.
Other adapters/versions need timing tests.

Search embeds a keyed Query and applies route results through `resultsChild.settle`.
Deferred controls pending work. Tests cover router abort, request-specific Fetch
cancellation, retained edits, and good data kept as Stale after failed revalidation.
No Foldkit backport was performed.

See [commit/source validation](COMMIT_SOURCE_VALIDATION.md) for commands, type
coverage, and source lifecycle limits. Run the browser checks with
`bun run test:browser` after installing Chromium.
