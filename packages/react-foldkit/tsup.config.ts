import { defineConfig } from "tsup"

/**
 * Foldkit is a regular dependency; Effect and React stay peer dependencies.
 * All three remain external so the consuming application owns final bundling
 * and tree-shaking.
 */
export default defineConfig({
	entry: {
		index: "src/index.ts",
		react: "src/react/public.ts",
		asyncData: "src/asyncData.ts",
		command: "src/command.ts",
		commitSource: "src/commitSource/public.ts",
		loader: "src/loader/public.ts",
		message: "src/message.ts",
		modelSource: "src/modelSource/public.ts",
		schema: "src/schema.ts",
		store: "src/store/public.ts",
		struct: "src/struct.ts",
		submodel: "src/submodel/public.ts",
		subscription: "src/subscription.ts",
		tanstack: "src/tanstack.ts",
		update: "src/update.ts",
	},
	format: ["esm"],
	dts: {
		resolve: true,
		compilerOptions: {
			ignoreDeprecations: "6.0",
		},
	},
	splitting: true,
	sourcemap: true,
	clean: true,
	treeshake: true,
	external: ["effect", /^foldkit(?:\/.*)?$/, /^@tanstack\//, "react", "react/jsx-runtime", "react/jsx-dev-runtime"],
})
