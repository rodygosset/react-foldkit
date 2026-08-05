import type { Rule } from "eslint"
import type { CallExpression } from "estree"
import {
	getFilename,
	getReactFoldkitSettings,
	isInsideExecute,
	matchesGlob,
	programExportsUpdate,
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
])

const DEFAULT_COMMAND_PATHS = [
	"**/store.ts",
	"**/store.*.ts",
	"**/*.test.ts",
	"**/vitest.setup.ts",
]

const meta: Rule.RuleMetaData = {
	type: "problem",
	docs: {
		description:
			"Disallow Effect.run* outside Command execute bodies, store internals, and tests.",
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

function getEffectRunMethod(node: CallExpression): string | null {
	const callee = node.callee
	if (callee.type !== "MemberExpression" || callee.computed) return null
	if (callee.object.type !== "Identifier" || callee.object.name !== "Effect") return null
	if (callee.property.type !== "Identifier") return null
	if (!EFFECT_RUN_METHODS.has(callee.property.name)) return null
	return callee.property.name
}

const rule: Rule.RuleModule = {
	meta,
	create(context) {
		const filename = getFilename(context)
		const allowedPath = matchesGlob(filename, getCommandPaths(context))
		let exportsUpdate = false
		const isTsx = filename.replace(/\\/g, "/").endsWith(".tsx")

		return {
			Program(node) {
				exportsUpdate = programExportsUpdate(node)
			},

			CallExpression(node) {
				if (allowedPath) return
				if (isInsideExecute(node as AstNode)) return

				const method = getEffectRunMethod(node)
				if (method == null) return

				if (!isTsx && !exportsUpdate) return

				context.report({ node, messageId: "effectRun", data: { method } })
			},
		}
	},
}

export default rule
