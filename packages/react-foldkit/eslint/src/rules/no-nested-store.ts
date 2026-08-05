import type { Rule } from "eslint"
import type { CallExpression } from "estree"
import {
	getEnclosingFunctionName,
	getFilename,
	isViewFilename,
	isViewFunctionName,
	type AstNode,
} from "../utils.js"

const meta: Rule.RuleMetaData = {
	type: "problem",
	docs: {
		description:
			"Disallow Store.boot / nested Provider inside View components (boot the store at the feature root).",
	},
	schema: [],
	messages: {
		storeBoot:
			"Do not call Store.boot (or boot) inside a View. Boot the store at the feature root (e.g. function Todo) and render <Provider> there.",
		providerInView:
			"Do not render <Provider> inside a View. Nesting stores breaks TEA boundaries — boot at the feature root instead.",
	},
}

function isInsideView(node: AstNode): boolean {
	return isViewFunctionName(getEnclosingFunctionName(node))
}

function isStoreBootCall(node: CallExpression): boolean {
	const callee = node.callee
	if (callee.type === "Identifier" && callee.name === "boot") {
		return true
	}
	if (
		callee.type === "MemberExpression" &&
		!callee.computed &&
		callee.object.type === "Identifier" &&
		callee.object.name === "Store" &&
		callee.property.type === "Identifier" &&
		callee.property.name === "boot"
	) {
		return true
	}
	return false
}

interface JsxOpeningElement {
	type: "JSXOpeningElement"
	name: { type: string; name?: string }
}

const rule: Rule.RuleModule = {
	meta,
	create(context) {
		const viewFile = isViewFilename(getFilename(context))

		return {
			CallExpression(node) {
				if (!isStoreBootCall(node)) return
				if (!viewFile && !isInsideView(node as AstNode)) return
				context.report({ node, messageId: "storeBoot" })
			},

			JSXOpeningElement(node: JsxOpeningElement) {
				if (node.name.type !== "JSXIdentifier" || node.name.name !== "Provider") return
				if (!isInsideView(node as unknown as AstNode)) return
				context.report({ node: node as never, messageId: "providerInView" })
			},
		}
	},
}

export default rule
