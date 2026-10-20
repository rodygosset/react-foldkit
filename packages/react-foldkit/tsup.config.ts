import { defineConfig } from "tsup"

/**
 * Foldkit, Effect, and React are peer dependencies. All three remain external so the
 * consuming application owns final bundling and tree-shaking.
 */
export default defineConfig({
	entry: {
		index: "src/index.ts",
		application: "src/application/public.ts",
		modelSource: "src/modelSource/public.ts",
		store: "src/store/public.ts",
		submodel: "src/submodel/public.ts",
		program: "src/program/public.ts",
	},
	format: ["esm"],
	dts: false,
	splitting: true,
	sourcemap: true,
	clean: true,
	treeshake: true,
	external: ["effect", /^foldkit(?:\/.*)?$/, "react", "react/jsx-runtime", "react/jsx-dev-runtime"],
})
