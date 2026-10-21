import type { PluginOption } from "vite"
import { devToolsPlugin } from "./vite/devToolsPlugin.js"

/**
 * Creates the Vite plugin that connects Foldkit's DevTools panel and MCP relay to React Foldkit
 * Providers.
 *
 * **When to use**
 *
 * Add it to `vite.config.ts` next to `@vitejs/plugin-react` when an application sets `devTools`
 * in `Application.define`'s options. After migrating to Foldkit's runtime, replace it with
 * `@foldkit/vite-plugin`; the `devTools` settings carry over unchanged.
 *
 * **Details**
 *
 * During `vite serve`, the plugin loads the panel from `@foldkit/devtools` in the browser, including
 * in frameworks that render HTML on the server, and passes the dev server's HMR channel to every
 * Provider, which shows the panel with `show: "Development"`. It
 * also starts Foldkit's DevTools MCP relay on a loopback port and publishes its address for the
 * Foldkit DevTools MCP server. `vite build` includes the panel only when `@foldkit/devtools` is a
 * production dependency. Unlike `@foldkit/vite-plugin`, it sends no full-page reloads, so React
 * Fast Refresh keeps working.
 *
 * **Gotchas**
 *
 * - Install `@foldkit/devtools` and its peer dependencies. Without it, the plugin does nothing.
 *
 * **Example** (Add DevTools to a React app)
 *
 * ```ts
 * import react from "@vitejs/plugin-react"
 * import { defineConfig } from "vite"
 * import { devTools } from "react-foldkit/vite"
 *
 * export default defineConfig({
 *   plugins: [react(), devTools()],
 * })
 * ```
 *
 * @category configuration
 * @since 0.2.0
 */
export const devTools = (): PluginOption => devToolsPlugin()
