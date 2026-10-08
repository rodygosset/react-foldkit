# Verify changes

The checks build the package, exercise its contracts, and validate consumers against emitted declarations. Run them from the repository root after [setting up the workspace](../README.md#run-locally).

## Check local changes

```sh
bun run check
```

This builds the library, checks workspace and consumer types, runs runtime and package tests, lints code, typechecks the project-cache example, and checks generated documentation and API declarations.

For a focused check, run `bun run --filter=react-foldkit` with `typecheck`, `test`, or `lint`. The [shared lint guide](../eslint/README.md) explains repository conventions.

## Check a release candidate

Install Chromium once, then run the additional checks.

```sh
bunx playwright install chromium
bun run check:release
```

This also runs browser tests from a cold cache, tests matching Foldkit and React Foldkit tarballs in a fresh consumer, and builds the web app. It does not publish anything.

## Update documentation and API records

After an intentional public API or JSDoc change, build first and regenerate the reference.

```sh
bun run --filter=react-foldkit build
bun run --filter=react-foldkit docs:generate
bun run --filter=react-foldkit check:docs
bun run --filter=react-foldkit check:api
```

Review the generated changes. Do not regenerate an API snapshot just to silence a failure. Markdown tutorial snippets are illustrative. The normal checks typecheck the project-cache source, not Markdown code fences.
