# Foldkit Scene copy

These files are Foldkit's Scene runner from the `foldkit` npm release recorded in [the manifest](../../../scripts/sceneVendorManifest.json), under Foldkit's [MIT license](LICENSE.foldkit). Foldkit does not export the hooks Scene needs to render a non-Foldkit view, so React Foldkit runs a copy for views bound with `bindSceneView`. Foldkit views still run on Foldkit's own runner.

- `*.upstream.js` are byte-for-byte copies of `foldkit/dist/test/*.js`.
- `scene.js`, `internal.js`, `query.js`, and `matchers.js` are those copies with the patches in [checkSceneVendor.mjs](../../../scripts/checkSceneVendor.mjs) applied. The patches replace private Foldkit imports with public entries or `sceneCompat.ts`, apply React effect messages before the next step, dispatch React interactions through the original host path, handle checkbox and radio activation, and unmount the React root when a scene ends.
- `sceneCompat.ts` copies the private helpers the runner imports. The manifest records the upstream text each helper must keep matching.

`bun run --filter=react-foldkit check:vendor` runs as part of lint. It fails when the installed Foldkit version, any upstream file hash, the Scene export list, the license, or the patched output differs from the record.

## Upgrade Foldkit

1. Install the new Foldkit release in the package and the demo.
2. Run `check:vendor`. Read the upstream diff of every file it reports.
3. Copy the new `dist/test` files over the `*.upstream.js` files and update the patch anchors in `checkSceneVendor.mjs` until they apply once each.
4. Update the version, hashes, and export list in the manifest. Run `node scripts/checkSceneVendor.mjs --write` from the package directory to regenerate the patched files.
5. Run `bun run check`. The Scene compatibility tests in `src/scene` cover each feature family on React views.

When Foldkit exports a way to supply a view renderer, delete this directory and call Foldkit's runner directly.
