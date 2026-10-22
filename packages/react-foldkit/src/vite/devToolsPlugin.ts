import { Option, Record, Schema } from "effect"
import { existsSync, readFileSync, realpathSync } from "node:fs"
import { dirname, join, resolve, sep } from "node:path"
import type { Plugin, PluginOption } from "vite"

import { devToolsRelayPlugin } from "./devToolsRelay.js"

const DEVTOOLS_PACKAGE = "@foldkit/devtools"
const DEVTOOLS_VITE_IMPORT = "@foldkit/devtools/vite"
const OVERLAY_MODULE_ID = "virtual:react-foldkit-devtools-overlay"
const RESOLVED_OVERLAY_MODULE_ID = `\0${OVERLAY_MODULE_ID}`
const REACT_FOLDKIT_IMPORT = /\bfrom\s*["']react-foldkit(?:\/application)?["']/
const OVERLAY_MODULE = `
import { overlay } from '${DEVTOOLS_VITE_IMPORT}'
import { __configure } from 'react-foldkit/devtools'

const dispose = __configure(overlay, import.meta.hot)
import.meta.hot?.dispose(dispose)
`

const PackageJson = Schema.Struct({
	dependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
	devDependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
	exports: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
})
const decodePackageJson = Schema.decodeUnknownSync(PackageJson)

const packageJsonAt = (directory: string, name: string): string => join(directory, "node_modules", name, "package.json")

const findUp = function (directory: string, matches: (directory: string) => boolean): Option.Option<string> {
	if (matches(directory)) return Option.some(directory)
	const parent = dirname(directory)
	return parent === directory ? Option.none() : findUp(parent, matches)
}

const readPackageJson = function (path: string): Option.Option<typeof PackageJson.Type> {
	try {
		return Option.some(decodePackageJson(JSON.parse(readFileSync(path, "utf8"))))
	} catch {
		return Option.none()
	}
}

const findInstalledPackage = (root: string, name: string): Option.Option<string> =>
	findUp(resolve(root), (directory) => existsSync(packageJsonAt(directory, name))).pipe(
		Option.map((directory) => packageJsonAt(directory, name))
	)

const hasOverlayExport = (root: string): boolean =>
	findInstalledPackage(root, DEVTOOLS_PACKAGE).pipe(
		Option.flatMap(readPackageJson),
		Option.flatMapNullishOr((manifest) => manifest.exports),
		Option.exists(Record.has("./vite"))
	)

const isInstalledPackageInNodeModules = (root: string, name: string): boolean =>
	findInstalledPackage(root, name).pipe(
		Option.flatMap(Option.liftThrowable((path: string) => realpathSync(dirname(path)))),
		Option.exists((directory) => directory.split(sep).includes("node_modules"))
	)

const isProductionDependency = (root: string): boolean =>
	findUp(resolve(root), (directory) => existsSync(join(directory, "package.json"))).pipe(
		Option.map((directory) => join(directory, "package.json")),
		Option.flatMap(readPackageJson),
		Option.flatMapNullishOr((manifest) => manifest.dependencies),
		Option.exists(Record.has(DEVTOOLS_PACKAGE))
	)

const shouldInject = (command: "serve" | "build", root: string): boolean =>
	hasOverlayExport(root) && (command === "serve" || isProductionDependency(root))

/** Creates the Vite plugin that injects and configures the DevTools overlay. */
export const devToolsPlugin = function (): PluginOption {
	let enabled = false

	const overlayPlugin: Plugin = {
		name: "react-foldkit:devtools",
		config(userConfig, environment) {
			const root = userConfig.root ?? process.cwd()
			if (environment.command !== "serve" || !shouldInject("serve", root)) {
				return
			}
			if (isInstalledPackageInNodeModules(root, DEVTOOLS_PACKAGE)) {
				return { optimizeDeps: { include: [DEVTOOLS_VITE_IMPORT] } }
			}
		},
		configResolved(config) {
			enabled = shouldInject(config.command, config.root)
		},
		resolveId: (id) => (id === OVERLAY_MODULE_ID ? RESOLVED_OVERLAY_MODULE_ID : undefined),
		load: (id) => (id === RESOLVED_OVERLAY_MODULE_ID ? OVERLAY_MODULE : undefined),
		// Frameworks that render HTML on the server, such as TanStack Start and React Router, never run
		// transformIndexHtml. Importing the overlay from browser modules that use React Foldkit covers them.
		// The import shares the first line so source maps keep their line numbers.
		transform(code, id) {
			if (!enabled || this.environment.config.consumer !== "client" || id.includes("/node_modules/")) return
			if (!REACT_FOLDKIT_IMPORT.test(code)) return
			return { code: `import "${OVERLAY_MODULE_ID}";${code}`, map: null }
		},
		transformIndexHtml: {
			order: "pre",
			handler() {
				if (!enabled) return
				return [
					{
						tag: "script",
						attrs: { type: "module" },
						children: `import '${OVERLAY_MODULE_ID}'`,
						injectTo: "head-prepend",
					},
				]
			},
		},
	}

	return [overlayPlugin, devToolsRelayPlugin()]
}
