# Work on React Foldkit

Read [the runtime explanation](packages/react-foldkit/docs/architecture.md) before changing lifecycle behavior. Run checks from the repository root as described in [verification](docs/verification.md).

Use Bun 1.3.14 and Node.js 24. Only `packages/react-foldkit` is published. The demo and UI packages are private.

## Preserve the contracts

- Updates, source construction, and snapshot reads are pure. Acquire live source resources in `subscribe` and return cleanup.
- Model snapshots are immutable. Selectors and snapshot reads stay synchronous.
- Use Effect Scope for ownership. Stop work before releasing its services. Run crash cleanup outside the failing fiber's Scope.
- Keep observer failures separate from Message delivery. Commit has no rollback and does not wait for Commands.
- Effect hosts can supply ambient services to `Store.make`. React and `Store.boot` require a closed Layer when services are needed.
- Preserve Foldkit's interrupt compatibility and the two-Store isolation test.
- Keep `test/conformance` passing. It runs the same programs on the Store and on Foldkit's runtime; change an expected trace only when Foldkit changed that behavior on purpose.

## Keep the package consistent

Public barrels define the exports. Do not reexport Foldkit vocabulary; applications import it from `foldkit`, a peer dependency. Follow [the JSDoc playbook](docs/jsdocPlaybook.md) for owned exports.

Use camelCase implementation filenames and directories. Keep public ESLint rule IDs in dash-case. Do not rename web app files. `check:filenames` checks the package conventions.

Do not edit `routeTree.gen.ts`, `dist`, `eslint/dist`, `.release`, or generated documentation by hand. Build and run `docs:generate` after an intentional API or JSDoc change, then review the generated diff.

Code copied from Foldkit lives in vendor directories with a lock file of the tested release, file hashes, and recorded patches. When upgrading Foldkit, run the vendor checks, recopy changed files, reapply the patches, and update the lock. Do not edit copied files except through the recorded patches.

Use the official Foldkit npm release. Keep the demo and package development dependency pinned to the same version, and bound the peer range to tested compatible versions. CI and packed consumer tests must install from the registry without sibling checkouts or dependency overrides. Define HttpApi-backed Queries with `Query.define` and read the client service inside `execute`.

## Prepare releases

Add a changeset for changes that affect package users. Use `patch` for compatible fixes and `minor` for features or breaking changes before 1.0. Include migration steps for breaking changes.

Run `bun run release:prepare` before publishing. It checks the code and coverage, then saves a tested tarball. Follow [the release procedure](docs/releasing.md). Publish only when the user asks.
