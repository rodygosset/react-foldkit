// @ts-check

import { recommendedConfig } from "./eslint/dist/index.js"
import functionStyleConfig from "../../eslint/function-style.config.mjs"

export default [
	...recommendedConfig,
	...functionStyleConfig,
	{
		settings: {
			"react-foldkit": {
				// Store/React infrastructure, test harnesses, and route loaders run Effects.
				commandPaths: [
					"**/store.ts",
					"**/store.*.ts",
					"**/*.test.{ts,tsx}",
					"**/vitest.setup.ts",
					"**/test/**",
					"**/src/react.tsx",
					"**/examples/*/src/app/routes/**",
				],
				urlBridgePaths: ["**/*.test.{ts,tsx}", "**/test/**"],
			},
		},
	},
	{
		files: ["examples/*/src/app/routes/__root.tsx"],
		// These layouts mount the application store at the root.
		rules: { "react-foldkit/no-nested-store": "off" },
	},
	{
		ignores: [
			"**/routeTree.gen.ts",
			"dist/**",
			"eslint/**",
			"vitest.config.ts",
			"vitest.browser.config.ts",
			"vitest.package.config.ts",
			"vitest.setup.ts",
			"tsup.config.ts",
			"tsup.eslint.config.ts",
		],
	},
]
