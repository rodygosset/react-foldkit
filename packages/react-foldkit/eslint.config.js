// @ts-check

import { recommendedConfig } from "./eslint/dist/index.js"

export default [
	...recommendedConfig,
	{
		ignores: [
			"dist/**",
			"eslint/**",
			"vitest.config.ts",
			"vitest.setup.ts",
			"tsup.config.ts",
			"tsup.eslint.config.ts",
		],
	},
]
