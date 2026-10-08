import type { ESLint } from "eslint"
import noDomainUseState from "./rules/noDomainUseState.js"
import noEffectRunOutsideCommands from "./rules/noEffectRunOutsideCommands.js"
import noNavigateOutsideCommands from "./rules/noNavigateOutsideCommands.js"
import noNestedStore from "./rules/noNestedStore.js"
import noStoreHooksInChildView from "./rules/noStoreHooksInChildView.js"

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
