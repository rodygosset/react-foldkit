---
"react-foldkit": minor
---

Connect Foldkit's DevTools to React Foldkit applications.

- `Application.define` accepts a `devTools` option with Foldkit's own `DevToolsConfig`: `show`, `position`, `mode`, `banner`, `excludeFromHistory`, `maxEntries`, `keyframeInterval`, and `Message` for MCP dispatch. The same settings carry over to Foldkit's runtime.
- `devTools()` from `react-foldkit/vite` loads Foldkit's panel from `@foldkit/devtools` and starts Foldkit's DevTools MCP relay. It sends no full-page reloads, so React Fast Refresh keeps working. Install `@foldkit/devtools` to use it.
- Each Provider records its own history. With several Providers on a page, a selector chooses which one the panel shows. In `"TimeTravel"` mode, a selected entry renders its Model while Commands and Subscriptions continue on the live Model, and Messages sent from the paused view are dropped.
- React Foldkit records no Mounts, so the panel's Mounts tab stays empty.
