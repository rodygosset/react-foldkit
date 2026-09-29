import type { Rule } from "eslint"
import {
	getFilename,
	getReactFoldkitSettings,
	origin,
	isApi,
	isInsideCommandExecute,
	matchesGlob,
	type AstNode,
} from "../utils.js"

const DEFAULT_URL_BRIDGE_PATHS: string[] = []

const meta: Rule.RuleMetaData = {
	type: "problem",
	docs: {
		description: "Disallow navigation APIs outside Command execute bodies (and configured URL bridge paths).",
	},
	schema: [],
	messages: {
		useNavigate:
			'Do not call useNavigate outside Commands. Put navigation in a Command.execute body, or allowlist the file via settings["react-foldkit"].urlBridgePaths.',
		navigateCall:
			'Do not call .navigate() outside Commands. Put navigation in a Command.execute body, or allowlist the file via settings["react-foldkit"].urlBridgePaths.',
		historyCall:
			'Do not call history.{{method}}() outside Commands. Put navigation in a Command.execute body, or allowlist the file via settings["react-foldkit"].urlBridgePaths.',
	},
}

function getUrlBridgePaths(context: Rule.RuleContext): string[] {
	const paths = getReactFoldkitSettings(context).urlBridgePaths
	if (Array.isArray(paths)) return paths
	return DEFAULT_URL_BRIDGE_PATHS
}

const isAllowedFile = (context: Rule.RuleContext): boolean =>
	matchesGlob(getFilename(context), getUrlBridgePaths(context))

const rule: Rule.RuleModule = {
	meta,
	create(context) {
		if (isAllowedFile(context)) {
			return {}
		}

		return {
			CallExpression(node) {
				if (isInsideCommandExecute(context, node as AstNode)) return
				const value = origin(context, node.callee)
				if (
					value?.module === "@tanstack/react-router" ||
					value?.module === "react-router" ||
					value?.module === "react-router-dom"
				) {
					if (isApi(value, value.module, "useNavigate")) context.report({ node, messageId: "useNavigate" })
					if (
						isApi(value, value.module, "createRouter()", "navigate") ||
						isApi(value, value.module, "useRouter()", "navigate")
					)
						context.report({ node, messageId: "navigateCall" })
				}
				const callee = node.callee
				if (callee.type !== "MemberExpression" || callee.computed || callee.property.type !== "Identifier")
					return
				const method = callee.property.name
				if (method !== "pushState" && method !== "replaceState") return
				const object = callee.object
				if (
					object.type === "Identifier" &&
					object.name === "history" &&
					value === undefined &&
					context.sourceCode.getScope(node).through.some((reference) => reference.identifier === object)
				) {
					context.report({ node, messageId: "historyCall", data: { method } })
				}
			},
		}
	},
}

export default rule
