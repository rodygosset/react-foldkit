import type { ESLint } from "eslint"
import noDomainUseState from "./rules/no-domain-use-state.js"
import noEffectRunOutsideCommands from "./rules/no-effect-run-outside-commands.js"
import noNavigateOutsideCommands from "./rules/no-navigate-outside-commands.js"
import noNestedStore from "./rules/no-nested-store.js"
import noStoreHooksInChildView from "./rules/no-store-hooks-in-child-view.js"

const plugin: ESLint.Plugin = {
	meta: {
		name: "react-foldkit",
	},
	rules: {
		"no-navigate-outside-commands": noNavigateOutsideCommands,
		"no-nested-store": noNestedStore,
		"no-effect-run-outside-commands": noEffectRunOutsideCommands,
		"no-store-hooks-in-child-view": noStoreHooksInChildView,
		"no-domain-use-state": noDomainUseState,
	},
}

export default plugin
