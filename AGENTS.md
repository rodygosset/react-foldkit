# Work on React Foldkit

These rules apply to every agent and contributor working in this repository.

## Write for people

All prose follows [the writing guide](docs/writing.md). This is required, not a preference. It covers docs, READMEs, JSDoc, changesets, commit messages, pull request descriptions, review comments, and every reply you write to the maintainer during a session.

- Write for someone who has never seen this code.
- For each change or finding, say what it is and why it matters, in plain words.
- Use short sentences, real file and symbol names, and no jargon. Explain a term the first time you need it.
- Make text easy to scan, with headings that state the point, tables for comparisons, and numbered steps.
- Show accurate code snippets in docs, pull request descriptions, review findings, and replies. Commit messages stay plain text.
- Remove the patterns the guide lists, such as dashes as punctuation, colons mid-sentence, filler, and inflated words.

## Start here

- Use Bun 1.3.14 and Node.js 24.
- Only `packages/react-foldkit` is published. The demo app and the UI package are private.
- Read [how the runtime works](packages/react-foldkit/docs/architecture.md) before you change lifecycle behavior.
- Run the checks from the repository root, as [verification](docs/verification.md) describes.
- To review and fix a pull request until it is ready, follow [the babysit skill](.claude/skills/babysit/SKILL.md).

## Keep the runtime contracts

- Updates, source construction, and snapshot reads stay pure. Acquire live resources in `subscribe` and return the cleanup.
- Model snapshots are immutable. Selectors and snapshot reads stay synchronous.
- Use an Effect Scope for ownership. Stop work before you release its services. Run crash cleanup outside the failing fiber's Scope.
- Keep observer failures separate from Message delivery. Commit has no rollback and does not wait for Commands.
- An Effect host can give `Store.make` services from its own context. React and `Store.boot` need a closed Layer when the Program needs services.
- Keep Foldkit's interrupt behavior and the test that two Stores stay isolated.
- Keep `test/conformance` passing. It runs the same Programs on the Store and on Foldkit's runtime. Change an expected trace only when Foldkit changed that behavior on purpose.

## Keep the package consistent

- The public barrels define the exports.
- Don't reexport Foldkit vocabulary. Applications import it from `foldkit`, a peer dependency. `react-foldkit/scene` is the one exception. It reexports `foldkit/scene` and adapts the Scene runner, so a test moves to Foldkit by changing one import.
- Follow [the JSDoc playbook](docs/jsdocPlaybook.md) for exported code.
- Name implementation files and directories in camelCase. Name public ESLint rules in dash-case. `check:filenames` checks the package names.
- Name files in `apps/web` in kebab-case, like the files already there.
- Don't edit `routeTree.gen.ts`, `dist`, `eslint/dist`, `.release`, or generated docs by hand. After an API or JSDoc change, build, run `docs:generate`, and review the generated diff.
- Define HttpApi-backed Queries with `Query.define`, and read the client service inside `execute`.

## Upgrade Foldkit

Use the official Foldkit release from npm. CI and the packed consumer tests install from the registry, with no sibling checkouts or dependency overrides.

Some Foldkit code is copied into vendor directories. Each copy records its Foldkit release, its file hashes, and the patches applied to it. Scene keeps that record in `scripts/sceneVendorManifest.json`. The DevTools, Store, and Vite copies keep it in a `vendorLock.json` next to the files. Change copied files only through the recorded patches.

To move to a new Foldkit release:

1. Pin the same version in `packages/react-foldkit` and `apps/web`, and set the peer ranges to the versions you tested.
2. Update the version in `scripts/checkDevToolsVendor.mjs`, then run `node scripts/checkDevToolsVendor.mjs --apply --write-lock` from `packages/react-foldkit`.
3. Update the version in `scripts/sceneVendorManifest.json`. Copy any changed upstream Scene file over its `*.upstream.js` copy, record its new hash, and run `node scripts/checkSceneVendor.mjs --write`.
4. Run `check:vendor`, `check:devtools-vendor`, and the full checks.

## Prepare releases

- Add a changeset when package users see a behavior or contract change. Use `patch` for a compatible fix and `minor` for a feature or a breaking change before 1.0. Give migration steps for a breaking change.
- Run `bun run release:prepare` before publishing. It runs the checks and coverage, then saves a tested tarball. Follow [the release procedure](docs/releasing.md).
- Publish only when the maintainer asks.
