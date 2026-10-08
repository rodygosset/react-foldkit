import type { Linter } from "eslint"
import plugin from "./plugin.js"

/**
 * Flat ESLint configuration for Command execution, Store ownership, navigation, and child
 * Views that receive Model data through props.
 *
 * Enables the four architecture rules as errors. Local React state remains unrestricted by
 * this preset.
 *
 * @see {@link strictConfig} for the optional local-state warning
 * @category configuration
 * @since 0.1.0
 */
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

/**
 * Flat ESLint configuration that adds the local-state warning to the recommended architecture
 * rules.
 *
 * @see {@link recommendedConfig} for the architecture rules alone
 * @category configuration
 * @since 0.1.0
 */
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
