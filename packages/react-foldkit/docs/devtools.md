# Debug with Foldkit DevTools

React Foldkit uses [Foldkit's DevTools](https://foldkit.dev/core/devtools) as they are, with the same panel, the same settings, and the same MCP server. React Foldkit connects them to your app, so you write no recorder and no React component.

## Set it up

1. Install Foldkit's panel and its peer dependencies as development dependencies:

```sh
npm install --save-dev @foldkit/devtools @foldkit/ui @effect/platform-browser
```

2. Add the Vite plugin next to React's:

```ts
// vite.config.ts
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { devTools } from "react-foldkit/vite"

export default defineConfig({
	plugins: [react(), devTools()],
})
```

3. Pass Foldkit's DevTools settings in the application's options:

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

`Message` lets an AI agent connected through the Foldkit DevTools MCP server send Messages, which the Schema checks first. Without it, the agent can still read the history.

`show` defaults to `"Development"`. The panel then appears only under `vite serve`, and only in a top-level window, not in an iframe.

## What you get

- A history entry for every Message, with the Model before and after it and the Commands it returned.
- Time travel in `"TimeTravel"` mode. Selecting an entry shows that entry's Model, while Commands and Subscriptions keep running on the live Model. Clicks in the paused view send nothing. Resume shows the latest Model again.
- One history per Provider. With several Providers on the page, a picker next to the panel chooses which one it shows.
- An MCP relay that starts with the dev server and publishes its address for the Foldkit DevTools MCP server.

The plugin works with plain Vite apps and with frameworks that render HTML on the server, such as TanStack Start. It never reloads the whole page, so React Fast Refresh keeps working.

React Foldkit records no Mounts, so the panel's Mounts tab stays empty.

## Keep the Model while you edit

Add `preserveModel()` from `react-foldkit/vite` too:

```ts
// vite.config.ts
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { devTools, preserveModel } from "react-foldkit/vite"

export default defineConfig({
	plugins: [react(), devTools(), preserveModel()],
})
```

Without it, editing the module that calls `Application.define` makes Fast Refresh remount that application's Provider, and the Model starts again from `init`. With it, the Provider keeps the live Model and runs the new code.

## Move to Foldkit later

Move the same `devTools` settings into Foldkit's `Runtime.makeApplication`, and replace `devTools()` with `foldkit()` from `@foldkit/vite-plugin`.

## How it is built

Foldkit doesn't export its DevTools recorder or MCP relay, so React Foldkit runs copies of them, pinned to the tested Foldkit release. `check:devtools-vendor` fails when a copy stops matching that release. [The third-party notices](../THIRD-PARTY-NOTICES.md) list the copies.

The Vite plugin loads `react-foldkit/devtools`, which registers the recorder, the same way Foldkit's plugin registers its panel. An app that never loads that entry ships none of the DevTools code, even if it sets `devTools`. The panel itself comes from your `@foldkit/devtools` install.
