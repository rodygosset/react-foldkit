import parser from "@typescript-eslint/parser"
import react from "eslint-plugin-react"
import { RecolnatReactPlugin, RecolnatStylePlugin } from "./function-style.mjs"

export default [
	{
		name: "recolnat/function-style",
		files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
		languageOptions: { parser },
		plugins: {
			"recolnat-style": RecolnatStylePlugin,
			"recolnat-react": RecolnatReactPlugin,
		},
		rules: {
			"recolnat-style/no-block-bodied-arrows": "error",
			"recolnat-style/no-named-function-expressions": "error",
			"recolnat-style/prefer-named-effect-callbacks": "error",
			"recolnat-style/prefer-arrow-for-expression-return": "error",
			"recolnat-style/prefer-object-method-shorthand": "error",
			"recolnat-react/prefer-hook-function-declaration": "error",
		},
	},
	{
		name: "recolnat/component-function-style",
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
