import type { PluginOption } from "vite"
import { devToolsPlugin } from "./vite/devToolsPlugin.js"
import { preserveModelPlugin } from "./vite/preserveModelPlugin.js"

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

/**
 * Creates the Vite plugin that keeps each Provider's Model when you edit the module that calls
 * `Application.define`.
 *
 * **When to use**
 *
 * Add it next to `@vitejs/plugin-react`. Without it, React Fast Refresh remounts the Provider of
 * an edited application module and its Model starts again from `init`. Modules that only render
 * keep their state either way.
 *
 * **Details**
 *
 * During `vite serve`, the plugin marks the start and end of every browser module that imports
 * React Foldkit, which gives each `Application.define` call a key that survives reloads. After a
 * reload, a Provider takes the live Model of the Provider it replaced at the same place in the
 * tree, if that Model still decodes with the new `Model` Schema. Otherwise it starts from `init`.
 * Restored Providers skip their init Commands, because those already ran.
 *
 * **Gotchas**
 *
 * - A Provider remounted for any other reason, such as a `key` change, still starts from `init`.
 * - Commands running at the moment of the reload stop and don't run again, as in Foldkit. A
 *   Model that waits for one of them keeps waiting until another Message changes it.
 * - `vite build` output is unchanged.
 *
 * **Example** (Keep the Model while editing an application)
 *
 * ```ts
 * import react from "@vitejs/plugin-react"
 * import { defineConfig } from "vite"
 * import { preserveModel } from "react-foldkit/vite"
 *
 * export default defineConfig({
 *   plugins: [react(), preserveModel()],
 * })
 * ```
 *
 * @category configuration
 * @since 0.2.0
 */
export const preserveModel = (): PluginOption => preserveModelPlugin()
