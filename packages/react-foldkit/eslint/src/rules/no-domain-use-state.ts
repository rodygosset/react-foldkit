import type { Rule } from "eslint"
import {
	getEnclosingFunctionName,
	getFilename,
	isIdentifierDefinition,
	isViewFilename,
	isViewFunctionName,
	type AstNode,
} from "../utils.js"

const DOMAIN_HOOKS = new Set(["useState", "useReducer"])

const meta: Rule.RuleMetaData = {
	type: "suggestion",
	docs: {
		description: "Discourage useState/useReducer in Views — domain state belongs in the Model.",
	},
	schema: [],
	messages: {
		domainState:
			"Domain state belongs in the Model, not {{hook}}. Allowlist local UI ephemera with eslint-disable and a reason.",
	},
}

function shouldCheck(node: AstNode, viewFile: boolean): boolean {
	if (viewFile) return true
	return isViewFunctionName(getEnclosingFunctionName(node))
}

const rule: Rule.RuleModule = {
	meta,
	create(context) {
		const viewFile = isViewFilename(getFilename(context))

		return {
			Identifier(node) {
				if (!DOMAIN_HOOKS.has(node.name)) return
				if (isIdentifierDefinition(node)) return
				if (!shouldCheck(node as AstNode, viewFile)) return
				context.report({
					node,
					messageId: "domainState",
					data: { hook: node.name },
				})
			},
		}
	},
}

export default rule
