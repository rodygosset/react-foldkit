import { describe, it } from "node:test"
import { RuleTester } from "eslint"
import parser from "@typescript-eslint/parser"
import { recommendedConfig, strictConfig } from "../dist/index.js"

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only
const tester = new RuleTester({ languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx: true } } } })
const rules = recommendedConfig[0].plugins["react-foldkit"].rules
const app = 'import { defineApplication as define } from "react-foldkit/react"; const App = define(config); '
const command = 'import { Command } from "react-foldkit"; import { Effect as Fx } from "effect"; '
const submodelApp =
	'import * as Submodel from "react-foldkit/submodel"; const Child = Submodel.define(); '
const file = "/app/src/view.tsx"
const valid = (code) => ({ code, filename: file })
const invalid = (code, messageId, data) => ({
	code,
	filename: file,
	errors: [{ messageId, ...(data === undefined ? {} : { data }) }],
})

tester.run("no-nested-store", rules["no-nested-store"], {
	valid: [
		valid("function View() { return <Provider/> }"),
		valid(
			'import * as Submodel from "react-foldkit/submodel"; const Child = Submodel.define(); function View() { return <Child.Provider/> }'
		),
		valid(app + "function View(App) { return <App.Provider/> }"),
		{ code: app + "function Feature() { return <App.Provider/> }", filename: "/app/src/feature.tsx" },
		valid("const Store = { boot() {} }; function View() { Store.boot() }"),
	],
	invalid: [
		invalid(app + "function View() { return <App.Provider/> }", "providerInView"),
		invalid(app + "const { Provider: Owner } = App; function View() { return <Owner/> }", "providerInView"),
		invalid('import * as S from "react-foldkit/store"; function View() { S.boot(config, init) }', "storeBoot"),
		invalid(
			'import { boot as start } from "react-foldkit/store"; function View() { start(config, init) }',
			"storeBoot"
		),
	],
})
tester.run("no-effect-run-outside-commands", rules["no-effect-run-outside-commands"], {
	valid: [
		valid(command + "Command.define({ name: 'Run', execute() { return Fx.runSync(task) } })"),
		valid(command + "function View(Fx) { Fx.runSync(task) }"),
		valid("const Effect = { runSync() {} }; Effect.runSync(task)"),
		{ ...valid(command + "Fx.runSync(task)"), settings: { "react-foldkit": { commandPaths: ["**/view.tsx"] } } },
	],
	invalid: [
		invalid(command + "function View() { Fx.runSync(task) }", "effectRun", { method: "runSync" }),
		invalid(command + "other({ execute() { return Fx.runSync(task) } })", "effectRun", { method: "runSync" }),
		invalid('import { runPromiseExit as run } from "effect/Effect"; run(task)', "effectRun", {
			method: "runPromiseExit",
		}),
		invalid(command + "const run = Fx.runSync; run(task)", "effectRun", { method: "runSync" }),
	],
})
tester.run("no-store-hooks-in-child-view", rules["no-store-hooks-in-child-view"], {
	valid: [
		valid(app + "function View() { App.useModel() }"),
		valid(app + "function View({dispatch}, App) { App.useModel() }"),
		valid("function View({dispatch}) { useModel() }"),
	],
	invalid: [
		invalid(app + "function View({dispatch}) { App.useModel() }", "storeHook", { hook: "useModel" }),
		invalid(app + "const { useCommit: commit } = App; function View({dispatch}) { commit() }", "storeHook", {
			hook: "useCommit",
		}),
		invalid(app + "function View(props: {dispatch: Function}) { App.useOptionalModel() }", "storeHook", {
			hook: "useOptionalModel",
		}),
		invalid(submodelApp + "function View({dispatch}) { Child.useModel() }", "storeHook", { hook: "useModel" }),
	],
})
tester.run("no-domain-use-state", rules["no-domain-use-state"], {
	valid: [
		valid("function View() { useState() }"),
		valid('import { useState as state } from "react"; function View(state) { state() }'),
		{
			code: 'import { useState } from "react"; function Feature() { useState(0) }',
			filename: "/app/src/feature.tsx",
		},
	],
	invalid: [
		invalid('import { useState as state } from "react"; function View() { state(0) }', "domainState", {
			hook: "useState",
		}),
		invalid('import React from "react"; function View() { React.useReducer(reducer, 0) }', "domainState", {
			hook: "useReducer",
		}),
	],
})
tester.run("no-navigate-outside-commands", rules["no-navigate-outside-commands"], {
	valid: [
		valid("const other = {navigate() {}}; other.navigate()"),
		valid('import { useNavigate } from "react-router-dom"; function View(useNavigate) { useNavigate() }'),
		valid(
			command +
				'import { createRouter } from "@tanstack/react-router"; const router = createRouter(config); Command.define({ execute() { router.navigate({to: "/"}) } })'
		),
		valid('function View(history) { history.pushState({}, "", "/") }'),
	],
	invalid: [
		invalid('import { useNavigate as useNav } from "@tanstack/react-router"; useNav()', "useNavigate"),
		invalid(
			'import { createRouter } from "@tanstack/react-router"; const router = createRouter(config); router.navigate({to: "/"})',
			"navigateCall"
		),
		invalid('history.pushState({}, "", "/")', "historyCall", { method: "pushState" }),
	],
})
it("publishes all five rules and keeps local-state policy opt-in", function () {
	if (Object.keys(rules).length !== 5 || strictConfig[1].rules["react-foldkit/no-domain-use-state"] !== "warn")
		throw new Error("Preset drift")
})
