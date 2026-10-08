import type { Rule } from "eslint"
import type { Identifier, Node as ESTreeNode, Pattern } from "estree"
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

export const getFilename = (context: Rule.RuleContext): string => context.filename || context.getFilename()

export function getReactFoldkitSettings(context: Rule.RuleContext): ReactFoldkitSettings {
	const settings = context.settings["react-foldkit"]
	if (settings != null && typeof settings === "object") {
		return settings as ReactFoldkitSettings
	}
	return {}
}

export function isKeyNamed(key: ESTreeNode, name: string): boolean {
	if (key.type === "Identifier") return key.name === name
	if (key.type === "Literal") return key.value === name
	return false
}

export function getEnclosingFunctionName(node: AstNode): string | null {
	let current = node.parent
	while (current) {
		if (current.type === "FunctionDeclaration" && current.id) {
			return current.id.name
		}
		if ((current.type === "FunctionExpression" || current.type === "ArrowFunctionExpression") && current.parent) {
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

const VIEW_FILENAME_GLOBS = ["**/view.tsx", "**/View*.tsx", "**/*View.tsx", "**/*-view.tsx", "**/*_view.tsx"]

export const isViewFilename = (filename: string): boolean => matchesGlob(filename, VIEW_FILENAME_GLOBS)

export function isViewFunctionName(name: string | null): boolean {
	if (name == null) return false
	return name === "View" || name.endsWith("View")
}

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

const isTsTypeLiteral = (typeNode: TsTypeNode): typeNode is TsTypeLiteral => typeNode.type === "TSTypeLiteral"

const isTsTypeReference = (typeNode: TsTypeNode): typeNode is TsTypeReference => typeNode.type === "TSTypeReference"

const isTsIntersectionOrUnion = (typeNode: TsTypeNode): typeNode is TsIntersectionOrUnion =>
	typeNode.type === "TSIntersectionType" || typeNode.type === "TSUnionType"

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

interface Origin {
	readonly module: string
	readonly path: ReadonlyArray<string>
}

function importedOrigin(module: string, path: ReadonlyArray<string>): Origin {
	const namespaces: Record<string, string> = {
		"effect/Effect": "Effect",
		"react-foldkit/react": "ReactFoldkit",
		"react-foldkit/submodel": "Submodel",
		"react-foldkit/store": "Store",
		"react-foldkit/command": "Command",
		"foldkit/command": "Command",
	}
	const namespace = namespaces[module]
	if (namespace !== undefined)
		return { module: module.startsWith("effect/") ? "effect" : "react-foldkit", path: [namespace, ...path] }
	return { module: module === "foldkit" ? "react-foldkit" : module, path }
}

export function origin(context: Rule.RuleContext, node: ESTreeNode, seen = new Set<object>()): Origin | undefined {
	if (node.type === "MemberExpression" && !node.computed && node.property.type === "Identifier") {
		const parent = origin(context, node.object, seen)
		return parent === undefined ? undefined : { ...parent, path: [...parent.path, node.property.name] }
	}
	if (node.type === "CallExpression") {
		const callee = origin(context, node.callee, seen)
		if (callee === undefined) return undefined
		return { ...callee, path: [...callee.path.slice(0, -1), callee.path[callee.path.length - 1] + "()"] }
	}
	if (node.type !== "Identifier") return undefined
	return bindingOrigin(context, node, node.name, seen)
}

export function bindingOrigin(
	context: Rule.RuleContext,
	at: ESTreeNode,
	name: string,
	seen = new Set<object>()
): Origin | undefined {
	let scope: ReturnType<typeof context.sourceCode.getScope> | null = context.sourceCode.getScope(at)
	while (scope !== null) {
		const variable = scope.set.get(name)
		if (variable === undefined) {
			scope = scope.upper
			continue
		}
		if (seen.has(variable)) return undefined
		seen.add(variable)
		if (variable.references.some((reference) => reference.isWrite() && !reference.init)) return undefined
		const definition = variable.defs[0]
		if (definition?.type === "ImportBinding") {
			const declaration = definition.parent
			if (declaration.type !== "ImportDeclaration" || typeof declaration.source.value !== "string")
				return undefined
			const specifier = definition.node
			const path =
				specifier.type === "ImportSpecifier"
					? [
							specifier.imported.type === "Identifier"
								? specifier.imported.name
								: String(specifier.imported.value),
						]
					: specifier.type === "ImportDefaultSpecifier" && declaration.source.value !== "react"
						? ["default"]
						: []
			return importedOrigin(declaration.source.value, path)
		}
		if (
			definition?.type !== "Variable" ||
			definition.node.type !== "VariableDeclarator" ||
			definition.node.init == null
		)
			return undefined
		const source = origin(context, definition.node.init, seen)
		if (source === undefined || definition.node.id.type !== "ObjectPattern") return source
		for (const property of definition.node.id.properties) {
			if (property.type !== "Property" || property.computed) continue
			const local = property.value.type === "Identifier" ? property.value.name : undefined
			if (local !== name) continue
			const key =
				property.key.type === "Identifier"
					? property.key.name
					: property.key.type === "Literal"
						? String(property.key.value)
						: undefined
			return key === undefined ? undefined : { ...source, path: [...source.path, key] }
		}
		return undefined
	}
	return undefined
}

export const isApi = (value: Origin | undefined, module: string, ...path: string[]): boolean =>
	value?.module === module &&
	value.path.length === path.length &&
	value.path.every((part, index) => part === path[index])

export function isInsideCommandExecute(context: Rule.RuleContext, node: AstNode): boolean {
	let current = node.parent
	while (current) {
		if (current.type === "Property" && isKeyNamed(current.key, "execute")) {
			const object = current.parent
			const call = object?.parent
			if (
				object?.type === "ObjectExpression" &&
				call?.type === "CallExpression" &&
				isApi(origin(context, call.callee), "react-foldkit", "Command", "define")
			)
				return true
		}
		current = current.parent
	}
	return false
}

export function applicationMember(value: Origin | undefined): string | undefined {
	if (value?.module !== "react-foldkit") return undefined
	const path = value.path
	if (path.length === 3) {
		if (path[0] === "ReactFoldkit" && (path[1] === "defineApplication()" || path[1] === "defineSubmodel()"))
			return path[2]
		if (path[0] === "Submodel" && path[1] === "define()") return path[2]
	}
	return undefined
}
