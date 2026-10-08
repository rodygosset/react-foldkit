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
			"**/routeTree.gen.ts",
		],
	},
	...functionStyleConfig,
]
