import type { Rule } from "eslint"
import type { Node } from "estree"
import {
	getEnclosingFunctionName,
	getFilename,
	isViewFilename,
	isViewFunctionName,
	origin,
	isApi,
	bindingOrigin,
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

const isInsideView = (node: AstNode): boolean => isViewFunctionName(getEnclosingFunctionName(node))

interface JsxName {
	type: string
	name?: string
	object?: JsxName
	property?: JsxName
}
interface JsxOpeningElement {
	type: "JSXOpeningElement"
	name: JsxName
}
function jsxOrigin(context: Rule.RuleContext, at: Node, name: JsxName): ReturnType<typeof origin> {
	if (name.type === "JSXIdentifier" && name.name !== undefined) return bindingOrigin(context, at, name.name)
	if (name.type === "JSXMemberExpression" && name.object !== undefined && name.property?.name !== undefined) {
		const value = jsxOrigin(context, at, name.object)
		return value === undefined ? undefined : { ...value, path: [...value.path, name.property.name] }
	}
	return undefined
}

const rule: Rule.RuleModule = {
	meta,
	create(context) {
		const viewFile = isViewFilename(getFilename(context))

		return {
			CallExpression(node) {
				if (!isApi(origin(context, node.callee), "react-foldkit", "Store", "boot")) return
				if (!viewFile && !isInsideView(node as AstNode)) return
				context.report({ node, messageId: "storeBoot" })
			},

			JSXOpeningElement(node: JsxOpeningElement) {
				if (
					!isApi(
						jsxOrigin(context, node as unknown as Node, node.name),
						"react-foldkit",
						"ReactFoldkit",
						"defineApplication()",
						"Provider"
					)
				)
					return
				if (!isInsideView(node as unknown as AstNode)) return
				context.report({ node: node as never, messageId: "providerInView" })
			},
		}
	},
}

export default rule
