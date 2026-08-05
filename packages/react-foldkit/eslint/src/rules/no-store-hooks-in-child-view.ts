import type { Rule } from "eslint"
import type { ArrowFunctionExpression, FunctionDeclaration, FunctionExpression } from "estree"
import { paramHasDispatch } from "../utils.js"

const STORE_HOOKS = new Set(["useDispatch", "useModel", "useStore"])

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

interface DispatchScopeTracker {
	enterFunction(node: FunctionNode): void
	exitFunction(node: FunctionNode): void
	isInDispatchComponent(): boolean
}

/**
 * Collect function nodes whose params introduce a `dispatch` binding.
 */
function createDispatchScopeTracker(): DispatchScopeTracker {
	const dispatchFunctions = new WeakSet<object>()
	const stack: object[] = []

	function markIfDispatchParams(node: FunctionNode): void {
		const params = node.params
		if (!params) return
		for (const param of params) {
			if (paramHasDispatch(param)) {
				dispatchFunctions.add(node)
				return
			}
		}
	}

	return {
		enterFunction(node) {
			markIfDispatchParams(node)
			stack.push(node)
		},
		exitFunction(node) {
			if (stack[stack.length - 1] === node) stack.pop()
		},
		isInDispatchComponent() {
			for (let i = stack.length - 1; i >= 0; i -= 1) {
				const frame = stack[i]
				if (frame !== undefined && dispatchFunctions.has(frame)) return true
			}
			return false
		},
	}
}

const rule: Rule.RuleModule = {
	meta,
	create(context) {
		const tracker = createDispatchScopeTracker()

		function onFunctionEnter(node: FunctionNode): void {
			tracker.enterFunction(node)
		}

		function onFunctionExit(node: FunctionNode): void {
			tracker.exitFunction(node)
		}

		return {
			FunctionDeclaration: onFunctionEnter,
			"FunctionDeclaration:exit": onFunctionExit,
			FunctionExpression: onFunctionEnter,
			"FunctionExpression:exit": onFunctionExit,
			ArrowFunctionExpression: onFunctionEnter,
			"ArrowFunctionExpression:exit": onFunctionExit,

			CallExpression(node) {
				if (!tracker.isInDispatchComponent()) return
				if (node.callee.type !== "Identifier") return
				if (!STORE_HOOKS.has(node.callee.name)) return
				context.report({
					node,
					messageId: "storeHook",
					data: { hook: node.callee.name },
				})
			},
		}
	},
}

export default rule
