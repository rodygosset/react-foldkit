import assert from "node:assert/strict"
import test from "node:test"
import { Linter } from "eslint"
import functionStyleConfig from "./function-style.config.mjs"

const linter = new Linter()
const rules = Object.assign({}, ...functionStyleConfig.map((config) => config.rules))
const disabledRules = Object.fromEntries(Object.keys(rules).map((rule) => [rule, "off"]))
const fixtures = {
	"recolnat-style/no-block-bodied-arrows": {
		valid: ["const size = (xs) => xs.length", "items.forEach(function () { work(); finish() })"],
		invalid: ["const size = (xs) => { return xs.length }", "items.forEach(() => { work(); finish() })"],
	},
	"recolnat-style/no-named-function-expressions": {
		valid: [
			"items.forEach(function () { work() })",
			"function handleClick() { work(); finish() }",
			"React.useEffect(function syncCount() { work() }, [])",
		],
		invalid: ["items.forEach(function handleItem() { work() })"],
	},
	"recolnat-style/prefer-named-effect-callbacks": {
		valid: [
			"useEffect(function syncCount() { work() }, [])",
			"React.useLayoutEffect(function syncLayout() { work() }, [])",
			"useInsertionEffect(function syncStyles() { work() }, [])",
			"useEffect(() => subscribe(), [])",
		],
		invalid: [
			"useEffect(function () { work() }, [])",
			"React.useLayoutEffect(() => { work() }, [])",
			"useInsertionEffect(function () { work() }, [])",
		],
	},
	"recolnat-style/prefer-arrow-for-expression-return": {
		valid: [
			"const size = (xs) => xs.length",
			"function Card() { return <div /> }",
			"function useCount() { return readCount() }",
			"class Source { getSnapshot() { return snapshot } }",
			"const source = { get model() { return snapshot } }",
			"const source = { getSnapshot() { return this.snapshot } }",
			"const source = { getSnapshot() { return (() => this.snapshot)() } }",
			"function countArgs() { return arguments.length }",
			"function construct() { return new.target }",
			"function* values() { return 1 }",
		],
		invalid: [
			"function size(xs) { return xs.length }",
			"items.map(function (item) { return item.id })",
			"const source = { getSnapshot() { return snapshot } }",
			"function factory() { return function () { return this.value } }",
		],
	},
	"recolnat-style/prefer-object-method-shorthand": {
		valid: [
			"const source = { subscribe() { work(); finish() } }",
			"const source = { read: () => snapshot }",
			"const source = { read: function () { return snapshot } }",
		],
		invalid: ["const source = { subscribe: function () { work(); finish() } }"],
	},
	"recolnat-react/prefer-hook-function-declaration": {
		valid: ["function useCount() { return readCount() }", "const userName = () => name"],
		invalid: ["const useCount = () => readCount()", "const useCount = function () { return readCount() }"],
	},
	"react/function-component-definition": {
		valid: ["function Card() { return <div /> }"],
		invalid: ["const Card = () => <div />"],
	},
}

for (const [rule, cases] of Object.entries(fixtures)) {
	test(rule, function () {
		const config = [...functionStyleConfig, { rules: { ...disabledRules, [rule]: "error" } }]
		for (const code of cases.valid) {
			assert.deepEqual(linter.verify(code, config, { filename: "src/fixture.tsx" }), [], code)
		}
		for (const code of cases.invalid) {
			const messages = linter.verify(code, config, { filename: "src/fixture.tsx" })
			assert.ok(messages.length > 0, code)
			assert.ok(
				messages.every((message) => message.ruleId === rule),
				JSON.stringify(messages)
			)
		}
	})
}

test("shared rules compose for callbacks, objects, components, and hooks", function () {
	const code = `
		const read = () => value;
		function work() { start(); finish() }
		const source = { read, write() { start(); finish() } };
		function useValue() { return read() }
		function Card() {
			React.useEffect(function syncValue() { start(); return () => finish() }, []);
			return <button onClick={function () { start(); finish() }}>Save</button>
		}
	`
	assert.deepEqual(linter.verify(code, functionStyleConfig, { filename: "src/fixture.tsx" }), [])
})
