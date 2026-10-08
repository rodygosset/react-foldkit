# Maintaining React Foldkit

## Run the checks

Set up the sibling Foldkit checkout and install dependencies as described in the [root README](../README.md).

Run the local checks:

```sh
bun run check
```

This command builds the library through Turbo, checks workspace types, runs unit and integration tests, runs lint and lint-rule tests, and checks emitted API types and examples. Package entry-point tests reuse that build. Turbo caches the build required by subsequent workspace checks.

Run the complete release checks:

```sh
bun run check:release
```

This command runs the local checks, browser tests, and the web production build. The browser suite uses Playwright Chromium. Install Chromium before the first run:

```sh
bunx playwright install chromium
```

If the host lacks browser system libraries, use Playwright's documented installation prerequisites. A failed or skipped browser suite does not verify the release checks.

## Run focused checks

Run package scripts with `bun run --filter=react-foldkit <script>`. Use `test`, `typecheck`, or `lint` while editing. Run `test:package` to build and test public entry points. Use `test:package:built` only after building the current source. Run `test:types:package` for emitted API checks and `test:types:example` for the package examples.

Keep runtime tests beside the public entry point or the implementation module they exercise. Shared fixtures, integration tests, browser tests, and consumer type tests belong in `test/`. Preserve the lifecycle and public API contracts described in the [architecture guide](architecture.md).
