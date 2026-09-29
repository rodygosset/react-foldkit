import type { Rule } from "eslint"
import type { Expression, Node } from "estree"

const LIFT_HOOKS = new Set(["useSubmodel", "useOptionalSubmodel"])

const meta: Rule.RuleMetaData = {
	type: "suggestion",
	docs: {
		description:
			"Disallow Submodel lifts built during render. A new lift creates a new child source on every render, so child views resubscribe each time.",
	},
	schema: [],
	messages: {
		inlineLift:
			"Declare this Submodel lift at module level, or memoize it with useMemo. A lift built during render creates a new child source on every render.",
	},
}

function calleeName(node: Node): string | undefined {
	if (node.type === "Identifier") return node.name
	if (node.type === "MemberExpression" && !node.computed && node.property.type === "Identifier")
		return node.property.name
	return undefined
}

// Object literals and lift()(...) calls build a new lift each time they run.
function isFreshLift(node: Expression): boolean {
	if (node.type === "ObjectExpression") return true
	if (node.type !== "CallExpression") return false
	return node.callee.type === "CallExpression" && calleeName(node.callee.callee) === "lift"
}

interface JsxAttribute {
	readonly type: "JSXAttribute"
	readonly name: { readonly type: string; readonly name?: string }
	readonly value: { readonly type: string; readonly expression?: Expression } | null
}

const rule: Rule.RuleModule = {
	meta,
	create: (context) => ({
		CallExpression(node) {
			const name = calleeName(node.callee)
			if (name === undefined || !LIFT_HOOKS.has(name)) return
			const [lift] = node.arguments
			if (lift !== undefined && lift.type !== "SpreadElement" && isFreshLift(lift))
				context.report({ node: lift, messageId: "inlineLift" })
		},
		JSXAttribute(node: JsxAttribute) {
			if (node.name.type !== "JSXIdentifier" || node.name.name !== "lift") return
			const expression = node.value?.type === "JSXExpressionContainer" ? node.value.expression : undefined
			if (expression !== undefined && isFreshLift(expression))
				context.report({ node: node as never, messageId: "inlineLift" })
		},
	}),
}

export default rule
