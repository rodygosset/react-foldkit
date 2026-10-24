import type { Plugin } from "vite"

const REACT_FOLDKIT_IMPORT = /\bfrom\s*["']react-foldkit(?:\/application)?["']/
const HOT = `globalThis[Symbol.for("react-foldkit/hot")]`

/**
 * Creates the Vite plugin that wraps each browser module importing React Foldkit in the hot
 * registry's `begin` and `end` calls, so every `Application.define` call keeps its key across
 * reloads.
 */
export const preserveModelPlugin = (): Plugin => ({
	name: "react-foldkit:preserve-model",
	apply: "serve",
	transform(code, id) {
		if (this.environment.config.consumer !== "client" || id.includes("/node_modules/")) return
		if (!REACT_FOLDKIT_IMPORT.test(code)) return
		// The calls share the first and last lines with the module, so source maps keep their line numbers.
		return { code: `${HOT}?.begin(import.meta.url);${code}\n;${HOT}?.end();`, map: null }
	},
})
