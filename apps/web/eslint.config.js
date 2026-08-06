// @ts-check

import { tanstackConfig } from "@tanstack/eslint-config"
import { recommendedConfig } from "react-foldkit/eslint"

export default [
	...tanstackConfig,
	...recommendedConfig,
	{
		settings: {
			"react-foldkit": {
				urlBridgePaths: ["**/router.tsx", "**/todo-search.ts", "**/routes/**"],
			},
		},
	},
	{
		rules: {
			"import/no-cycle": "off",
			"import/order": "off",
			"sort-imports": "off",
			"@typescript-eslint/array-type": "off",
			"@typescript-eslint/require-await": "off",
			"pnpm/json-enforce-catalog": "off",
		},
	},
	{
		ignores: ["eslint.config.js", ".prettierrc", "src/routeTree.gen.ts"],
	},
]
