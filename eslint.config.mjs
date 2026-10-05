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
			"**/routeTree.gen.ts",
		],
	},
	...functionStyleConfig,
]
