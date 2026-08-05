import { defineConfig } from "tsup"

export default defineConfig({
	entry: ["eslint/src/index.ts"],
	outDir: "eslint/dist",
	format: ["esm"],
	dts: {
		compilerOptions: {
			ignoreDeprecations: "6.0",
		},
	},
	splitting: false,
	sourcemap: true,
	clean: true,
	treeshake: true,
	external: ["eslint", "picomatch"],
})
