import type { Rule } from "eslint"
import {
	getFilename,
	getReactFoldkitSettings,
	isIdentifierDefinition,
	isInsideExecute,
	matchesGlob,
	type AstNode,
} from "../utils.js"

const DEFAULT_URL_BRIDGE_PATHS: string[] = []

const meta: Rule.RuleMetaData = {
	type: "problem",
	docs: {
		description:
			"Disallow navigation APIs outside Command execute bodies (and configured URL bridge paths).",
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

function isAllowedFile(context: Rule.RuleContext): boolean {
	return matchesGlob(getFilename(context), getUrlBridgePaths(context))
}

const rule: Rule.RuleModule = {
	meta,
	create(context) {
		if (isAllowedFile(context)) {
			return {}
		}

		return {
			Identifier(node) {
				if (node.name !== "useNavigate") return
				if (isIdentifierDefinition(node)) return
				if (isInsideExecute(node as AstNode)) return
				context.report({ node, messageId: "useNavigate" })
			},

			CallExpression(node) {
				if (node.callee.type !== "MemberExpression" || node.callee.computed) return
				if (isInsideExecute(node as AstNode)) return

				const prop = node.callee.property
				if (prop.type !== "Identifier") return

				if (prop.name === "navigate") {
					context.report({ node, messageId: "navigateCall" })
					return
				}

				if (prop.name === "push" || prop.name === "replace") {
					const object = node.callee.object
					const isHistory =
						(object.type === "Identifier" && object.name === "history") ||
						(object.type === "MemberExpression" &&
							!object.computed &&
							object.property.type === "Identifier" &&
							object.property.name === "history")
					if (isHistory) {
						context.report({ node, messageId: "historyCall", data: { method: prop.name } })
					}
				}
			},
		}
	},
}

export default rule
