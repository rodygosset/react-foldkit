# Third-party notices

React Foldkit depends on [Foldkit](https://github.com/foldkit/foldkit) as a peer dependency and adapts its model freezing. Foldkit is excluded from the bundled output, except for copies the DevTools integration bundles: the DevTools recorder and MCP bridge modules from foldkit 0.168.0 (`dist/devTools`, with three private import paths redirected to public `foldkit` entries), and the relay registry modules from @foldkit/vite-plugin 0.28.0. `devToolsRelay.ts` and `devToolsPlugin.ts` adapt that plugin's relay and overlay injection. `bun run --filter=react-foldkit check:devtools-vendor` checks every copy against the recorded release. Both packages use the MIT license reproduced below.

## Foldkit

The copied recorder's Clear action starts new history at the live Model and clears old init Commands. The patch is recorded in `scripts/checkDevToolsVendor.mjs`. Run `bun run --filter=react-foldkit check:devtools-vendor -- --apply --write-lock` to reapply recorded patches and update their hashes.

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
