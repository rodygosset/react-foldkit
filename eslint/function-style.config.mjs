import parser from "@typescript-eslint/parser"
import react from "eslint-plugin-react"
import { FoldkitReactPlugin, FoldkitStylePlugin } from "./function-style.mjs"

export default [
	{
		name: "foldkit/function-style",
		files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
		languageOptions: { parser },
		plugins: {
			"foldkit-style": FoldkitStylePlugin,
			"foldkit-react": FoldkitReactPlugin,
		},
		rules: {
			"foldkit-style/no-block-bodied-arrows": "error",
			"foldkit-style/no-named-function-expressions": "error",
			"foldkit-style/prefer-named-effect-callbacks": "error",
			"foldkit-style/prefer-arrow-for-expression-return": "error",
			"foldkit-style/prefer-object-method-shorthand": "error",
			"foldkit-react/prefer-hook-function-declaration": "error",
		},
	},
	{
		name: "foldkit/component-function-style",
		files: ["**/*.{jsx,tsx}"],
		plugins: { react },
		settings: { react: { version: "19.2" } },
		rules: {
			"react/function-component-definition": [
				"error",
				{ namedComponents: "function-declaration", unnamedComponents: "arrow-function" },
			],
		},
	},
]
