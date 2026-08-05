/**
 * Shared helpers for react-foldkit ESLint rules.
 */

import type { Rule } from "eslint"
import type {
	Identifier,
	Node as ESTreeNode,
	Pattern,
	Program,
} from "estree"
import picomatch from "picomatch"

export type AstNode = ESTreeNode & {
	parent?: AstNode | null
}

interface TsTypeAnnotation {
	type: "TSTypeAnnotation"
	typeAnnotation?: TsTypeNode | null
}

interface TsTypeLiteral {
	type: "TSTypeLiteral"
	members: Array<{
		type: string
		key?: { type: string; name?: string }
	}>
}

interface TsTypeReference {
	type: "TSTypeReference"
	typeName?: unknown
}

interface TsIntersectionOrUnion {
	type: "TSIntersectionType" | "TSUnionType"
	types: TsTypeNode[]
}

interface TsOtherType {
	type: string
}

type TsTypeNode = TsTypeLiteral | TsTypeReference | TsIntersectionOrUnion | TsOtherType

type IdentifierWithTs = Identifier & {
	typeAnnotation?: TsTypeAnnotation
	parent?: AstNode | null
}

export interface ReactFoldkitSettings {
	urlBridgePaths?: string[]
	commandPaths?: string[]
}

export function matchesGlob(filename: string, patterns: string | string[]): boolean {
	const path = filename.replace(/\\/g, "/")
	const list = Array.isArray(patterns) ? patterns : [patterns]

	for (const pattern of list) {
		if (typeof pattern !== "string" || pattern.length === 0) continue
		if (!pattern.includes("*") && !pattern.includes("?")) {
			if (path.includes(pattern) || path.endsWith(pattern)) return true
			continue
		}
		if (picomatch.isMatch(path, pattern, { dot: true })) return true
	}

	return false
}

export function getFilename(context: Rule.RuleContext): string {
	return context.filename || context.getFilename()
}

export function getReactFoldkitSettings(context: Rule.RuleContext): ReactFoldkitSettings {
	const settings = context.settings["react-foldkit"]
	if (settings != null && typeof settings === "object") {
		return settings as ReactFoldkitSettings
	}
	return {}
}

/**
 * True when node is nested under a property keyed execute
 * (Command.define execute bodies).
 */
export function isInsideExecute(node: AstNode): boolean {
	let current = node.parent
	while (current) {
		if (current.type === "Property" && isKeyNamed(current.key, "execute")) {
			return true
		}
		current = current.parent
	}
	return false
}

export function isKeyNamed(key: ESTreeNode, name: string): boolean {
	if (key.type === "Identifier") return key.name === name
	if (key.type === "Literal") return key.value === name
	return false
}

/**
 * Name of the nearest enclosing function (declaration, variable, or property).
 */
export function getEnclosingFunctionName(node: AstNode): string | null {
	let current = node.parent
	while (current) {
		if (current.type === "FunctionDeclaration" && current.id) {
			return current.id.name
		}
		if (
			(current.type === "FunctionExpression" || current.type === "ArrowFunctionExpression") &&
			current.parent
		) {
			const parent = current.parent
			if (parent.type === "VariableDeclarator" && parent.id.type === "Identifier") {
				return parent.id.name
			}
			if (parent.type === "Property") {
				if (parent.key.type === "Identifier") return parent.key.name
				if (parent.key.type === "Literal" && typeof parent.key.value === "string") {
					return parent.key.value
				}
			}
			if (parent.type === "AssignmentExpression" && parent.left.type === "Identifier") {
				return parent.left.name
			}
		}
		current = current.parent
	}
	return null
}

const VIEW_FILENAME_GLOBS = ["**/View*.tsx", "**/*View.tsx", "**/*-view.tsx", "**/*_view.tsx"]

export function isViewFilename(filename: string): boolean {
	return matchesGlob(filename, VIEW_FILENAME_GLOBS)
}

/** `View`, `TodoView`, `ElapsedDisplayView`, etc. */
export function isViewFunctionName(name: string | null): boolean {
	if (name == null) return false
	return name === "View" || name.endsWith("View")
}

/**
 * True when the identifier is a binding/import name, not a use-site reference.
 */
export function isIdentifierDefinition(node: IdentifierWithTs): boolean {
	const parent = node.parent
	if (!parent) return false

	if (parent.type === "ImportSpecifier" && (parent.imported === node || parent.local === node)) {
		return true
	}
	if (
		parent.type === "ImportDefaultSpecifier" ||
		parent.type === "ImportNamespaceSpecifier" ||
		parent.type === "ImportDeclaration"
	) {
		return true
	}
	if (parent.type === "FunctionDeclaration" && parent.id === node) return true
	if (parent.type === "VariableDeclarator" && parent.id === node) return true
	if (parent.type === "Property" && parent.key === node && !parent.computed && parent.shorthand) {
		// Shorthand property in an ObjectPattern is a definition.
		return parent.parent != null && parent.parent.type === "ObjectPattern"
	}
	if (parent.type === "Property" && parent.key === node && !parent.computed && !parent.shorthand) {
		return false
	}
	if (parent.type === "ArrayPattern") return true
	if (parent.type === "RestElement") return true
	if (parent.type === "AssignmentPattern" && parent.left === node) return true

	return false
}

/**
 * Whether a function parameter introduces a dispatch binding (destructured
 * or typed props object with a dispatch field).
 */
export function paramHasDispatch(param: Pattern): boolean {
	if (param.type === "Identifier" && param.name === "dispatch") return true

	if (param.type === "ObjectPattern") {
		for (const prop of param.properties) {
			if (prop.type !== "Property") continue
			if (isKeyNamed(prop.key, "dispatch")) return true
		}
		return false
	}

	if (param.type === "Identifier") {
		const typed = param as IdentifierWithTs
		if (typed.typeAnnotation) {
			return typeAnnotationHasDispatch(typed.typeAnnotation)
		}
	}

	if (param.type === "AssignmentPattern") {
		return paramHasDispatch(param.left)
	}

	return false
}

function typeAnnotationHasDispatch(typeAnnotation: TsTypeAnnotation): boolean {
	const typeNode = typeAnnotation.typeAnnotation
	if (!typeNode) return false
	return tsTypeHasDispatchProp(typeNode)
}

function isTsTypeLiteral(typeNode: TsTypeNode): typeNode is TsTypeLiteral {
	return typeNode.type === "TSTypeLiteral"
}

function isTsTypeReference(typeNode: TsTypeNode): typeNode is TsTypeReference {
	return typeNode.type === "TSTypeReference"
}

function isTsIntersectionOrUnion(typeNode: TsTypeNode): typeNode is TsIntersectionOrUnion {
	return typeNode.type === "TSIntersectionType" || typeNode.type === "TSUnionType"
}

function tsTypeHasDispatchProp(typeNode: TsTypeNode): boolean {
	if (isTsTypeLiteral(typeNode)) {
		for (const member of typeNode.members) {
			if (
				member.type === "TSPropertySignature" &&
				member.key &&
				member.key.type === "Identifier" &&
				member.key.name === "dispatch"
			) {
				return true
			}
		}
		return false
	}
	if (isTsTypeReference(typeNode) && typeNode.typeName) {
		return false
	}
	if (isTsIntersectionOrUnion(typeNode)) {
		return typeNode.types.some(tsTypeHasDispatchProp)
	}
	return false
}

/**
 * Scan a Program for an exported binding named update.
 */
export function programExportsUpdate(program: Program): boolean {
	for (const statement of program.body) {
		if (statement.type === "ExportNamedDeclaration") {
			if (statement.declaration) {
				const decl = statement.declaration
				if (decl.type === "FunctionDeclaration" && decl.id && decl.id.name === "update") {
					return true
				}
				if (decl.type === "VariableDeclaration") {
					for (const d of decl.declarations) {
						if (d.id.type === "Identifier" && d.id.name === "update") return true
					}
				}
			}
			for (const spec of statement.specifiers || []) {
				if (spec.exported.type === "Identifier" && spec.exported.name === "update") {
					return true
				}
			}
		}
		if (statement.type === "ExportDefaultDeclaration") {
			const decl = statement.declaration
			if (decl.type === "FunctionDeclaration" && decl.id && decl.id.name === "update") {
				return true
			}
			if (decl.type === "Identifier" && decl.name === "update") return true
		}
	}
	return false
}
