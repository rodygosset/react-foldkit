import type { Rule } from "eslint"
import type { CallExpression } from "estree"
import {
	getFilename,
	getReactFoldkitSettings,
	isInsideCommandExecute,
	origin,
	isApi,
	matchesGlob,
	type AstNode,
} from "../utils.js"

const EFFECT_RUN_METHODS = new Set([
	"runSync",
	"runPromise",
	"runFork",
	"runForkWith",
	"runCallback",
	"runPromiseExit",
	"runSyncExit",
	"runSyncWith",
	"runSyncExitWith",
	"runPromiseWith",
	"runPromiseExitWith",
])

const DEFAULT_COMMAND_PATHS = ["**/store.ts", "**/store.*.ts", "**/*.test.ts", "**/vitest.setup.ts"]

const meta: Rule.RuleMetaData = {
	type: "problem",
	docs: {
		description: "Disallow Effect.run* outside Command execute bodies, store internals, and tests.",
	},
	schema: [],
	messages: {
		effectRun:
			'Do not call Effect.{{method}} outside Commands. Run effects in Command.execute (or store internals / tests via settings["react-foldkit"].commandPaths).',
	},
}

function getCommandPaths(context: Rule.RuleContext): string[] {
	const paths = getReactFoldkitSettings(context).commandPaths
	if (Array.isArray(paths)) return paths
	return DEFAULT_COMMAND_PATHS
}

function getEffectRunMethod(context: Rule.RuleContext, node: CallExpression): string | null {
	const value = origin(context, node.callee)
	if (value === undefined || value.path.length !== 2) return null
	const method = value.path[1]
	return method !== undefined && EFFECT_RUN_METHODS.has(method) && isApi(value, "effect", "Effect", method)
		? method
		: null
}

const rule: Rule.RuleModule = {
	meta,
	create(context) {
		const filename = getFilename(context)
		const allowedPath = matchesGlob(filename, getCommandPaths(context))

		return {
			CallExpression(node) {
				if (allowedPath) return
				if (isInsideCommandExecute(context, node as AstNode)) return

				const method = getEffectRunMethod(context, node)
				if (method == null) return

				context.report({ node, messageId: "effectRun", data: { method } })
			},
		}
	},
}

export default rule
