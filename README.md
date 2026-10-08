# React Foldkit

React Foldkit brings Foldkit's typed Elm Architecture vocabulary to React. It provides a React store and Provider alongside Foldkit's `Model`, `Message`, `Update`, `Command`, and `Subscription` primitives.

This repository is an early feedback workspace. The package API and lifecycle semantics are documented in [`packages/react-foldkit/README.md`](packages/react-foldkit/README.md).

## Local Foldkit dependency

The library and demo app use `../foldkit/packages/foldkit` from the sibling
Foldkit checkout. Keep that checkout on `feat/query-httpapi`, build its package,
and install this workspace:

```sh
(cd ../foldkit && pnpm --filter foldkit build)
bun install
```

Query and HTTP API endpoint derivation come from `foldkit/experimental/query`.
Effect and `@effect/vitest` use `4.0.0` to match the branch. After changing
Foldkit source, rebuild Foldkit and refresh the local dependency with
`bun install --force --frozen-lockfile`.

## Requirements

- [Bun](https://bun.sh/) 1.3.14
- Node.js 20 or newer

## Setup

```bash
bun install --frozen-lockfile
```

The install hook patches TypeScript 7 and Oxlint with `@effect/tsgo`.
Effect diagnostics, including all rules from the `effect-native` preset, are
enabled in the workspace TypeScript projects and Oxlint. Warnings remain visible
without failing typechecks; `bun run lint` fails on lint warnings. Run `bun run lint:effect` to inspect
the library's Effect diagnostics from the command line.

For Cursor or VS Code, install the recommended **TypeScript 7** extension
(`TypeScriptTeam.native-preview`). Open a TypeScript file, run **TypeScript:
Select Version**, and select the workspace version. The workspace settings
point to `node_modules/typescript/bin`, whose version should include
`+effect-tsgo`. After reinstalling dependencies, run **TypeScript: Restart TS
Server** to reload the patched binary.

Run the example application:

```bash
bun run dev --filter=web
```

The development server is available at <http://localhost:3000>.

## Verification

Run `bun run check` for local verification. Run `bun run check:release` to include browser tests and the web production build. The [maintenance guide](docs/maintaining.md) describes each command and browser setup.

Function syntax is enforced across source, tests, examples, shared UI, and tooling. See [the function syntax rules](eslint/README.md) for the conventions. Their regression tests run as part of `check`, or separately with `bun run test:lint`.

## Repository layout

- `packages/react-foldkit` — the library, its ESLint plugin, tests, and package documentation.
- `apps/web` — examples that exercise React Foldkit in a TanStack Start application.
- `packages/ui` — shared UI components used by the example application.
- `repos/foldkit` and `repos/effect` — vendored upstream source snapshots kept as read-only references for development agents. They are not part of this repository's workspace task graph or review scope.

The [architecture guide](docs/architecture.md) describes module boundaries and lifecycle ownership. Historical proposals and validation records live in [docs/history](docs/history/README.md).

When reviewing the project, focus on `packages/react-foldkit` and `apps/web`. See the [package README](packages/react-foldkit/README.md) for usage examples and API details.
