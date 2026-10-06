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

Run the example application:

```bash
bun run dev --filter=web
```

The development server is available at <http://localhost:3000>.

## Verification

Run the same checks used before sharing changes:

```bash
bun run build --filter=react-foldkit
bun run typecheck
bun run test --filter=react-foldkit
bun run lint
bun run build --filter=web
```

Function syntax is enforced across source, tests, examples, shared UI, and tooling.
See [the function syntax rules](eslint/README.md) for the conventions copied from
Recolnat. Run their regression tests separately with `bun run test:lint`.

## Repository layout

- `packages/react-foldkit` — the library, its ESLint plugin, tests, and package documentation.
- `apps/web` — examples that exercise React Foldkit in a TanStack Start application.
- `packages/ui` — shared UI components used by the example application.
- `repos/foldkit` and `repos/effect` — vendored upstream source snapshots kept as read-only references for development agents. They are not part of this repository's workspace task graph or review scope.

When reviewing the project, focus on `packages/react-foldkit` and `apps/web`. See the [package README](packages/react-foldkit/README.md) for usage examples and API details.
