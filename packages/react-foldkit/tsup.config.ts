import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "tsup"

const root = path.dirname(fileURLToPath(import.meta.url))
const foldkitSrc = path.resolve(root, "../../repos/foldkit/packages/foldkit/src")

/**
 * Bundles Foldkit source into this package. `effect` and `react` stay external
 * (peer deps). Apps never depend on or import `foldkit`.
 */
export default defineConfig({
	entry: {
		index: "src/index.ts",
		react: "src/react.tsx",
		asyncData: "src/asyncData.ts",
		command: "src/command.ts",
		message: "src/message.ts",
		schema: "src/schema.ts",
		store: "src/store.ts",
		struct: "src/struct.ts",
		submodel: "src/submodel.ts",
		subscription: "src/subscription.ts",
		update: "src/update.ts",
	},
	format: ["esm"],
	dts: {
		resolve: true,
		compilerOptions: {
			ignoreDeprecations: "6.0",
		},
	},
	splitting: false,
	sourcemap: true,
	clean: true,
	treeshake: true,
	external: ["effect", "react", "react/jsx-runtime", "react/jsx-dev-runtime"],
	esbuildOptions: function (options) {
		options.alias = {
			...(options.alias ?? {}),
			// Absolute aliases so any nested Foldkit `foldkit/*` import still resolves to src.
			foldkit: path.join(foldkitSrc, "index.ts"),
			"foldkit/asyncData": path.join(foldkitSrc, "asyncData/public.ts"),
			"foldkit/command": path.join(foldkitSrc, "command/public.ts"),
			"foldkit/command/interruptible": path.join(foldkitSrc, "command/interruptible/index.ts"),
			"foldkit/message": path.join(foldkitSrc, "message/public.ts"),
			"foldkit/schema": path.join(foldkitSrc, "schema/public.ts"),
			"foldkit/struct": path.join(foldkitSrc, "struct/public.ts"),
			"foldkit/subscription": path.join(foldkitSrc, "subscription/public.ts"),
			"foldkit/update": path.join(foldkitSrc, "update/public.ts"),
		}
	},
})
