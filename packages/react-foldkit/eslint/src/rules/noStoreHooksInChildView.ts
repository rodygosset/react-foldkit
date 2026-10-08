import type { Rule } from "eslint"
import type { ArrowFunctionExpression, FunctionDeclaration, FunctionExpression } from "estree"
import { paramHasDispatch, applicationMember, origin } from "../utils.js"

const STORE_HOOKS = new Set([
	"useDispatch",
	"useModel",
	"useCommit",
	"useOptionalModel",
	"useOptionalDispatch",
	"useOptionalCommit",
])

const meta: Rule.RuleMetaData = {
	type: "problem",
	docs: {
		description:
			"Disallow store hooks inside components that already receive `dispatch` as a prop (child Views should be props-only).",
	},
	schema: [],
	messages: {
		storeHook:
			"Do not call {{hook}} in a component that receives `dispatch` as a prop. Child Views should be props-only (model + dispatch).",
	},
}

type FunctionNode = FunctionDeclaration | FunctionExpression | ArrowFunctionExpression

const rule: Rule.RuleModule = {
	meta,
	create(context) {
		const dispatchScopes: boolean[] = []
		function onFunctionEnter(node: FunctionNode): void {
			dispatchScopes.push(node.params.some(paramHasDispatch))
		}
		function onFunctionExit(): void {
			dispatchScopes.pop()
		}

		return {
			FunctionDeclaration: onFunctionEnter,
			"FunctionDeclaration:exit": onFunctionExit,
			FunctionExpression: onFunctionEnter,
			"FunctionExpression:exit": onFunctionExit,
			ArrowFunctionExpression: onFunctionEnter,
			"ArrowFunctionExpression:exit": onFunctionExit,

			CallExpression(node) {
				if (!dispatchScopes.some((hasDispatch) => hasDispatch)) return
				const hook = applicationMember(origin(context, node.callee))
				if (hook === undefined || !STORE_HOOKS.has(hook)) return
				context.report({
					node,
					messageId: "storeHook",
					data: { hook },
				})
			},
		}
	},
}

export default rule
