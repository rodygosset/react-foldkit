# Debug with Foldkit DevTools

React Foldkit uses [Foldkit's DevTools](https://foldkit.dev/core/devtools): the same panel, the same settings, and the same MCP server. React Foldkit supplies the runtime connection, so you write no recorder or React component.

## Set it up

Install Foldkit's panel and its peer dependencies as development dependencies.

```sh
npm install --save-dev @foldkit/devtools @foldkit/ui @effect/platform-browser
```

Add the Vite plugin next to React's.

```ts
// vite.config.ts
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { devTools } from "react-foldkit/vite"

export default defineConfig({
	plugins: [react(), devTools()],
})
```

Pass Foldkit's DevTools settings to the application.

```ts
import * as Application from "react-foldkit/application"

export const App = Application.define(program, {
	devTools: {
		position: "BottomRight",
		mode: "TimeTravel",
		maxEntries: 100,
		Message,
	},
})
```

`Message` lets an agent connected through the Foldkit DevTools MCP server dispatch validated Messages. Without it, the MCP server can still read history. `show` defaults to `"Development"`, which shows the panel only under `vite serve` in a top-level window.

## What you get

- Every Message, its Model before and after, and the Commands it returned.
- In `"TimeTravel"` mode, selecting an entry renders that entry's Model. Commands and Subscriptions keep running on the live Model, and clicks in the paused view send nothing. Resume renders the latest live Model.
- Each Provider records its own history. With several Providers on the page, a selector next to the panel chooses which one it shows.
- The MCP relay starts with the dev server and publishes its address for the Foldkit DevTools MCP server.

The plugin works with plain Vite apps and with frameworks that render HTML on the server, such as TanStack Start. It sends no full-page reloads, so React Fast Refresh keeps working.

React Foldkit records no Mounts, so the panel's Mounts tab stays empty.

## Migrate to Foldkit

Move the same `devTools` settings into Foldkit's `Runtime.makeApplication`, and replace `devTools()` with `foldkit()` from `@foldkit/vite-plugin`.

## How it is built

Foldkit does not export its DevTools recorder or MCP relay, so React Foldkit runs copies of them, pinned to the tested Foldkit release. The panel itself comes from your `@foldkit/devtools` install. `check:devtools-vendor` fails when a copy no longer matches the recorded release; see [the third-party notices](../THIRD-PARTY-NOTICES.md).
