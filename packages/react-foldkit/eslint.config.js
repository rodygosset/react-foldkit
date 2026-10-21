// @ts-check

import { recommendedConfig } from "./eslint/dist/index.js"
import reactHooks from "eslint-plugin-react-hooks"
import functionStyleConfig from "../../eslint/function-style.config.mjs"

export default [
	...recommendedConfig,
	...functionStyleConfig,
	{
		files: ["src/**/*.{ts,tsx}", "examples/**/*.{ts,tsx}", "test/**/*.{ts,tsx}"],
		plugins: { "react-hooks": reactHooks },
		rules: {
			"react-hooks/rules-of-hooks": "error",
			"react-hooks/exhaustive-deps": "error",
		},
	},
	{
		settings: {
			"react-foldkit": {
				// Store/React infrastructure and test harnesses run Effects.
				commandPaths: [
					"**/store.ts",
					"**/store.*.ts",
					"**/*.test.{ts,tsx}",
					"**/vitest.setup.ts",
					"**/test/**",
					"**/scripts/**",
					"**/src/application/**",
					"**/src/store/**",
				],
				urlBridgePaths: ["**/*.test.{ts,tsx}", "**/test/**"],
			},
		},
	},
	{
		files: ["test/types/**"],
		// Type tests build lifts inline to check inference; nothing there renders.
		rules: { "react-foldkit/no-inline-submodel-lift": "off" },
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
			"test/docs/.generated/**",
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
