import { defineConfig } from "tsup"

/**
 * Foldkit is a regular dependency; Effect and React stay peer dependencies.
 * All three remain external so the consuming application owns final bundling
 * and tree-shaking.
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
	external: ["effect", /^foldkit(?:\/.*)?$/, "react", "react/jsx-runtime", "react/jsx-dev-runtime"],
})
