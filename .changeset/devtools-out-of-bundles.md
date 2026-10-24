---
"react-foldkit": patch
---

Keep DevTools code out of production bundles. `react-foldkit/devtools` now registers the DevTools recorder along with the overlay, and the `devTools()` Vite plugin loads that entry. An application that never loads it ships no recorder, DevTools store, or MCP bridge, even when it sets the `devTools` option. A minified `Application.define` bundle drops from 50 KB to 19 KB.
