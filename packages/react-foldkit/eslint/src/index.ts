import type { Linter } from "eslint"
import plugin from "./plugin.js"

export const recommendedConfig: Linter.Config[] = [
	{
		name: "react-foldkit/recommended",
		plugins: { "react-foldkit": plugin },
		rules: {
			"react-foldkit/no-navigate-outside-commands": "error",
			"react-foldkit/no-nested-store": "error",
			"react-foldkit/no-effect-run-outside-commands": "error",
			"react-foldkit/no-store-hooks-in-child-view": "error",
		},
	},
]

export const strictConfig: Linter.Config[] = [
	...recommendedConfig,
	{
		name: "react-foldkit/strict",
		rules: {
			"react-foldkit/no-domain-use-state": "warn",
		},
	},
]

export default recommendedConfig
