# Foldkit Scene copy

These files are a copy of Foldkit's Scene test runner, from the `foldkit` release recorded in [the manifest](../../../scripts/sceneVendorManifest.json), under Foldkit's [MIT license](LICENSE.foldkit).

## Why the copy exists

Foldkit's runner can only render Foldkit views, and Foldkit doesn't export a way to plug in another renderer. So React Foldkit runs this patched copy for React views bound with `bindSceneView`. Foldkit views still run on Foldkit's own runner.

Delete this folder once Foldkit lets callers supply a view renderer, and call Foldkit's runner directly.

## What the files are

| File | What it is |
| --- | --- |
| `*.upstream.js` | Exact copies of `foldkit/dist/test/*.js` |
| `scene.js`, `internal.js`, `query.js`, `matchers.js` | The upstream copies with the patches from [checkSceneVendor.mjs](../../../scripts/checkSceneVendor.mjs) applied |
| `sceneCompat.ts` | Copies of the private Foldkit helpers the runner imports. The manifest records the upstream text each one must keep matching. |

The patches do the following:

- Replace private Foldkit imports with public entries or `sceneCompat.ts`.
- Apply Messages from React effects before the next step runs.
- Send React interactions through the same path a browser uses.
- Handle checkbox and radio clicks.
- Unmount the React root when a scene ends. If both the scene and the unmount fail, Effect keeps both failures.

The copied role query also counts an empty `disabled` attribute as disabled, as React DOM does. Only React views use this query. Foldkit views keep Foldkit's.

## Keep it in sync

`check:vendor` runs as part of lint. It fails when the installed Foldkit version, an upstream file's hash, the Scene export list, the license, or a patched file no longer matches the record.

To move to a new Foldkit release:

1. Install the new release in the package and the demo app.
2. Run `check:vendor`, and read the upstream diff of every file it reports.
3. Copy the new `dist/test` files over the `*.upstream.js` files. If a patch no longer applies, update its anchor in `checkSceneVendor.mjs` until each one matches exactly once.
4. Update the version, the hashes, and the export list in the manifest. Then run `node scripts/checkSceneVendor.mjs --write` from the package folder to regenerate the patched files.
5. Run `bun run check`. The Scene tests in `src/scene` cover each kind of interaction on React views.
