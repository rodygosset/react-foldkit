# Third-party notices

React Foldkit uses [Foldkit](https://github.com/foldkit/foldkit) as a peer dependency, so the package doesn't bundle it. The exceptions are these copied files, plus React Foldkit's model freezing, which adapts Foldkit's.

| Copy | Source | Checked by |
| --- | --- | --- |
| The Store's Managed Resource watcher | `foldkit` 0.169.0, `dist/runtime/managedResourceFibers`. Its type declaration points to the Store adapter. | `check:devtools-vendor` |
| The `react-foldkit/scene` test runner, patched | `foldkit` 0.169.0, `dist/test/scene.js`, `internal.js`, `query.js`, and `matchers.js` | `check:vendor` |
| The DevTools recorder and MCP bridge | `foldkit` 0.169.0, `dist/devTools`, with three private imports pointed at public `foldkit` entries | `check:devtools-vendor` |
| The DevTools relay registry | `@foldkit/vite-plugin` 0.28.0. `devToolsRelay.ts` and `devToolsPlugin.ts` adapt the plugin's relay and overlay loading. | `check:devtools-vendor` |

Run each check with `bun run --filter=react-foldkit <check>`.

## Foldkit

The copied DevTools recorder has one behavior patch. Its Clear action starts the new history at the live Model and drops the old init Commands. `scripts/checkDevToolsVendor.mjs` records the patch. To reapply the patches and update their hashes, run `bun run --filter=react-foldkit check:devtools-vendor -- --apply --write-lock`.

Foldkit and `@foldkit/vite-plugin` both use the MIT license:

The MIT License (MIT)

Copyright (c) 2025 Devin Jameson

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
