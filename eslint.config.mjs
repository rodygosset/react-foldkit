import functionStyleConfig from "./eslint/function-style.config.mjs"

export default [
	{
		ignores: [
			"repos/**",
			"**/node_modules/**",
			"**/dist/**",
			"**/build/**",
			"**/.output/**",
			"**/.tanstack/**",
			"**/.turbo/**",
			"**/coverage/**",
			"packages/react-foldkit/test/docs/.generated/**",
			// Copied from Foldkit and verified by check:devtools-vendor.
			"packages/react-foldkit/src/devtoolsVendor/**",
			"packages/react-foldkit/src/vite/vendor/**",
			"packages/react-foldkit/src/vite/fixtures/**",
			"**/routeTree.gen.ts",
		],
	},
	...functionStyleConfig,
]
