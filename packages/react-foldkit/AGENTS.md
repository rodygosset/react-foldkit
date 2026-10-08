# Working on React Foldkit

Read [the runtime explanation](docs/architecture.md) before changing lifecycle behavior. Run checks from the repository root as described in [verification](../../docs/verification.md).

## Preserve the contracts

- Updates, source construction, and snapshot reads are pure. Acquire live source resources in `subscribe` and return cleanup.
- Model snapshots are immutable. Selectors and snapshot reads stay synchronous.
- Use Effect Scope for ownership. Stop work before releasing its services. Run crash cleanup outside the failing fiber's Scope.
- Keep observer failures separate from Message delivery. Commit has no rollback and does not wait for Commands.
- Effect hosts can supply ambient services to `Store.make`. React and `Store.boot` require a closed Layer when services are needed.
- Preserve Foldkit's interrupt compatibility and the two-Store isolation test.

## Keep the package consistent

Public barrels define the exports. Foldkit reexports retain their identity and documentation. Follow [the JSDoc playbook](../../docs/jsdocPlaybook.md) for owned exports.

Use camelCase implementation filenames and directories. Keep public ESLint rule IDs in dash-case. Do not rename web app files. `check:filenames` checks the package conventions.

Do not edit `routeTree.gen.ts`, `dist`, `eslint/dist`, or generated documentation by hand. Build and run `docs:generate` after an intentional API or JSDoc change, then review the generated diff.

Foldkit intentionally remains a local file dependency. CI uses `rodygosset/foldkit` on `feat/query-httpapi`. Do not replace that dependency or switch the sibling checkout without a user instruction.
