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
			// Copied from Foldkit and verified by check:vendor; see the vendor README.
			"packages/react-foldkit/src/scene/vendor/**",
			"**/routeTree.gen.ts",
		],
	},
	...functionStyleConfig,
]
