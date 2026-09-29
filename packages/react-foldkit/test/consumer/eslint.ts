import { strict as assert } from "node:assert"
import { ESLint } from "eslint"
import { recommendedConfig, strictConfig } from "react-foldkit/eslint"

assert.ok(strictConfig.length > recommendedConfig.length)
const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: recommendedConfig })
const results = await eslint.lintText('import { Effect } from "effect"; Effect.runSync(Effect.void)', {
	filePath: "view.js",
})
assert.ok(
	results.some((result) =>
		result.messages.some((message) => message.ruleId === "react-foldkit/no-effect-run-outside-commands")
	)
)
