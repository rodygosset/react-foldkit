// Function-shape rules copied from MNHN/recolnat eslint.config.ts.
const RecolnatReactPlugin = {
	meta: { name: "recolnat-react", version: "0.0.0" },
	rules: {
		"prefer-hook-function-declaration": {
			meta: {
				type: "suggestion",
				docs: {
					description: "Custom hooks must use `function useName() {}`, not `const useName = () => {}`.",
				},
				schema: [],
				messages: {
					useFunctionDeclaration:
						"Declare hooks with `function useName() { … }`, not a `const` initialized with an arrow or function expression.",
				},
			},
			create(context) {
				function checkInit(init) {
					if (!init) return
					if (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression") {
						context.report({
							node: init,
							messageId: "useFunctionDeclaration",
						})
					}
				}
				return {
					VariableDeclarator(node) {
						if (node.id.type !== "Identifier") return
						if (!/^use[A-Z]/.test(node.id.name)) return
						checkInit(node.init ?? null)
					},
					ExportNamedDeclaration(node) {
						if (node.declaration?.type !== "VariableDeclaration") return
						for (const decl of node.declaration.declarations) {
							if (decl.id.type !== "Identifier") continue
							if (!/^use[A-Z]/.test(decl.id.name)) continue
							checkInit(decl.init ?? null)
						}
					},
				}
			},
		},
	},
}
const effectHookNames = new Set(["useEffect", "useLayoutEffect", "useInsertionEffect"])
function isReactEffectCallback(node, context) {
	const ancestors = context.sourceCode.getAncestors(node)
	const parent = ancestors[ancestors.length - 1]
	if (parent == null || parent.type !== "CallExpression") return false
	if (parent.arguments[0] !== node) return false
	const callee = parent.callee
	if (callee.type === "Identifier") return effectHookNames.has(callee.name)
	if (callee.type === "MemberExpression" && !callee.computed && callee.property.type === "Identifier") {
		return effectHookNames.has(callee.property.name)
	}
	return false
}
// Receiver-dependent functions cannot become arrows without changing behavior.
function hasOwnFunctionBindings(node, context) {
	function visit(current) {
		if (current !== node.body && ["FunctionExpression", "FunctionDeclaration"].includes(current.type)) return false
		if (current.type === "ThisExpression" || current.type === "Super") return true
		if (current.type === "Identifier" && current.name === "arguments") return true
		if (current.type === "MetaProperty" && current.meta.name === "new") return true
		return (context.sourceCode.visitorKeys[current.type] ?? []).some(function (key) {
			const child = current[key]
			return Array.isArray(child)
				? child.some((value) => value != null && visit(value))
				: child != null && visit(child)
		})
	}
	return visit(node.body)
}

const RecolnatStylePlugin = {
	meta: { name: "recolnat-style", version: "0.0.0" },
	rules: {
		"no-block-bodied-arrows": {
			meta: {
				type: "problem",
				docs: {
					description:
						"Block-bodied arrows are forbidden. Use `function () { … }` (anonymous callback) or `function name() { … }` (named helper). Expression bodies stay arrows.",
				},
				schema: [],
				messages: {
					useFunctionKeyword:
						"Do not use a block-bodied arrow. Use `function () { … }` for inline callbacks, or `function name() { … }` for named helpers. Expression-bodied arrows (`() => expr`) are fine. See eslint/README.md.",
					nameEffect:
						"Do not use a block-bodied arrow for effects. Use a named function: `useEffect(function syncFoo() { … }, …)`. See eslint/README.md.",
				},
			},
			create: (context) => ({
				ArrowFunctionExpression(node) {
					if (node.body.type !== "BlockStatement") return
					if (isReactEffectCallback(node, context)) {
						context.report({ node, messageId: "nameEffect" })
						return
					}
					context.report({ node, messageId: "useFunctionKeyword" })
				},
			}),
		},
		"no-named-function-expressions": {
			meta: {
				type: "problem",
				docs: {
					description:
						"Inline/callback function expressions must be anonymous, except block-bodied `useEffect` / `useLayoutEffect` / `useInsertionEffect` callbacks which must be named.",
				},
				schema: [],
				messages: {
					unnamedOnly:
						"Do not name a function expression (`function handleClick() { … }`). Use anonymous `function () { … }` inline, or extract `function handleClick() { … }` as a declaration and pass it by reference. Exception: name `useEffect` / `useLayoutEffect` / `useInsertionEffect` callbacks. See eslint/README.md.",
				},
			},
			create: (context) => ({
				FunctionExpression(node) {
					if (node.id == null) return
					if (isReactEffectCallback(node, context)) return
					context.report({ node: node.id, messageId: "unnamedOnly" })
				},
			}),
		},
		"prefer-named-effect-callbacks": {
			meta: {
				type: "problem",
				docs: {
					description:
						"Block-bodied `useEffect` / `useLayoutEffect` / `useInsertionEffect` callbacks must be named function expressions for clarity in profiles and stack traces.",
				},
				schema: [],
				messages: {
					nameEffect:
						"Name this effect callback (`useEffect(function syncFoo() { … }, …)`). Anonymous and block-bodied arrow effect callbacks are forbidden. See eslint/README.md.",
				},
			},
			create(context) {
				function reportIfAnonymousEffect(node) {
					if (!isReactEffectCallback(node, context)) return
					if (node.type === "ArrowFunctionExpression") {
						if (node.body.type !== "BlockStatement") return
						context.report({ node, messageId: "nameEffect" })
						return
					}
					if (node.id != null) return
					context.report({ node, messageId: "nameEffect" })
				}
				return {
					ArrowFunctionExpression(node) {
						reportIfAnonymousEffect(node)
					},
					FunctionExpression(node) {
						reportIfAnonymousEffect(node)
					},
				}
			},
		},
		"prefer-arrow-for-expression-return": {
			meta: {
				type: "suggestion",
				docs: {
					description:
						"Non-component helpers that only `return` an expression should be arrows (including object properties / method shorthand). React components, hooks, and class methods keep `function` + block body.",
				},
				schema: [],
				messages: {
					useArrow:
						"This function only returns an expression — use an arrow (`const {{name}} = (…) => …`, `(…) => …`, or object `{ {{name}}: (…) => … }`). React components and hooks are exempt and must stay `function` declarations. See eslint/README.md.",
				},
			},
			create(context) {
				function isExemptName(name) {
					if (name == null || name.length === 0) return false
					if (/^[A-Z]/.test(name)) return true
					if (/^use[A-Z]/.test(name)) return true
					return false
				}
				function isExpressionReturnBody(body) {
					if (body.body.length !== 1) return false
					const [only] = body.body
					if (only == null || only.type !== "ReturnStatement") return false
					return only.argument != null
				}
				/** Class methods stay `method()` form; object method shorthand with expression-only return should become an arrow property. */
				function isClassMethod(node) {
					const ancestors = context.sourceCode.getAncestors(node)
					const parent = ancestors[ancestors.length - 1]
					return (
						parent?.type === "MethodDefinition" || (parent?.type === "Property" && parent.kind !== "init")
					)
				}
				function propertyName(node) {
					const ancestors = context.sourceCode.getAncestors(node)
					const parent = ancestors[ancestors.length - 1]
					if (parent == null || parent.type !== "Property") return null
					if (parent.computed) return null
					if (parent.key.type === "Identifier") return parent.key.name
					if (parent.key.type === "Literal" && typeof parent.key.value === "string") return parent.key.value
					return null
				}
				function reportIfNeeded(node, name) {
					if (node.generator) return
					if (isClassMethod(node) || hasOwnFunctionBindings(node, context)) return
					if (isReactEffectCallback(node, context)) return
					if (node.body.type !== "BlockStatement") return
					if (!isExpressionReturnBody(node.body)) return
					if (isExemptName(name)) return
					context.report({
						node,
						messageId: "useArrow",
						data: { name: name ?? "fn" },
					})
				}
				return {
					FunctionDeclaration(node) {
						reportIfNeeded(node, node.id?.name ?? null)
					},
					FunctionExpression(node) {
						if (node.id != null && !isReactEffectCallback(node, context)) return
						reportIfNeeded(node, propertyName(node) ?? node.id?.name ?? null)
					},
				}
			},
		},
		"prefer-object-method-shorthand": {
			meta: {
				type: "suggestion",
				docs: {
					description:
						"Object properties with a real block body must use method shorthand (`{ foo(args) { … } }`). Expression-only returns use an arrow property instead (`{ foo: (args) => … }`).",
				},
				schema: [],
				messages: {
					useMethodShorthand:
						"Use method shorthand for block-bodied object functions (`{ {{name}}(…) { … } }`), not `{{name}}: function (…) { … }`. If the body only returns an expression, use an arrow property (`{ {{name}}: (…) => … }`) instead. See eslint/README.md.",
				},
			},
			create(context) {
				function isExpressionReturnBody(body) {
					if (body.body.length !== 1) return false
					const [only] = body.body
					if (only == null || only.type !== "ReturnStatement") return false
					return only.argument != null
				}
				return {
					Property(node) {
						if (node.method || node.kind !== "init" || node.shorthand) return
						if (node.value.type !== "FunctionExpression") return
						if (node.value.body.type !== "BlockStatement") return
						// Expression-only → prefer-arrow-for-expression-return (arrow property), not method shorthand.
						if (isExpressionReturnBody(node.value.body)) return
						const name =
							!node.computed && node.key.type === "Identifier"
								? node.key.name
								: !node.computed && node.key.type === "Literal" && typeof node.key.value === "string"
									? node.key.value
									: "fn"
						context.report({
							node: node.value,
							messageId: "useMethodShorthand",
							data: { name },
						})
					},
				}
			},
		},
	},
}
export { RecolnatReactPlugin, RecolnatStylePlugin }
