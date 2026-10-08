import { parse, stringify } from "./json.mjs"
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { resolve, dirname, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { Data, Effect, Schema } from "effect"
import ts from "typescript6"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const manifest = parse(
	Schema.Struct({ exports: Schema.Record(Schema.String, Schema.Unknown) }),
	readFileSync(resolve(root, "package.json"), "utf8")
)
const entries = Object.keys(manifest.exports).map(function (entry) {
	const name = entry === "." ? "index" : entry.slice(2)
	return {
		entry: entry === "." ? "react-foldkit" : "react-foldkit/" + name,
		file: resolve(
			root,
			name === "eslint" ? "eslint/src/index.ts" : "src/" + name + (name === "react" ? ".tsx" : ".ts")
		),
	}
})
class PublicApiError extends Data.TaggedError("PublicApiError") {}
const mode = process.argv[2] ?? "check"

function documentation(node) {
	const docs = ts.getJSDocCommentsAndTags(ts.isNamespaceExport(node) ? node.parent : node).filter(ts.isJSDoc)
	return docs.map((doc) => doc.getText()).join("\n")
}
const declarationNode = (node) => (ts.isVariableDeclaration(node) ? node.parent.parent : node)
function modelDocs(checker, symbol) {
	const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
	const declarations = target.declarations ?? []
	const local = declarations.filter(
		(node) =>
			node.getSourceFile().fileName.startsWith(root + "/src/") ||
			node.getSourceFile().fileName.startsWith(root + "/eslint/src/")
	)
	const own = (symbol.declarations ?? []).map((node) => documentation(node)).join("\n")
	const text = own || local.map((node) => documentation(declarationNode(node))).join("\n")
	const inherited = ts.displayPartsToString(target.getDocumentationComment(checker))
	return { target, local, text, inherited }
}
function verifyDocs(checker, symbol, label, failures, seen, member = false) {
	const { target, local, text, inherited } = modelDocs(checker, symbol)
	if (seen.has(target)) return
	seen.add(target)
	if (local.length === 0) return
	if (member) {
		if (/@category\b/.test(text)) failures.push(label + " has a member @category")
		for (const node of local) {
			for (const doc of ts.getJSDocCommentsAndTags(node).filter(ts.isJSDoc))
				verifyComment(checker, doc, label, failures)
		}
		return
	}
	if (text.length === 0 && inherited.length === 0) failures.push(label + " lacks a description")
	if (!/@since\s+\d+\.\d+\.\d+\b/.test(text)) failures.push(label + " lacks package @since")
	if (!/@category\s+\S/.test(text)) failures.push(label + " lacks @category")
	if (local.some(ts.isClassDeclaration) && /@category\s+errors\b/.test(text) && /\*\*Example\*\*/.test(text))
		failures.push(label + " has an error-class example")
	const nodes = local.map(declarationNode)
	for (const node of new Set([...(symbol.declarations ?? []), ...nodes])) {
		const documented = ts.isNamespaceExport(node) ? node.parent : node
		for (const doc of ts.getJSDocCommentsAndTags(documented).filter(ts.isJSDoc)) {
			verifyComment(checker, doc, label, failures)
		}
	}
	for (const node of local) {
		if (!ts.isInterfaceDeclaration(node) && !ts.isTypeAliasDeclaration(node)) continue
		const type = checker.getDeclaredTypeOfSymbol(target)
		for (const member of checker.getPropertiesOfType(type)) {
			if (member.name.startsWith("__@")) continue
			verifyDocs(checker, member, label + "." + member.name, failures, seen, true)
		}
	}
}
function verifyComment(checker, doc, label, failures) {
	const tags = Array.from(doc.tags ?? [], (tag) => tag.tagName.text)
	const order = ["deprecated", "default", "see", "stability", "category", "since"]
	const ordered = tags.filter((tag) => order.includes(tag))
	if (ordered.some((tag, index) => index > 0 && order.indexOf(tag) < order.indexOf(ordered[index - 1])))
		failures.push(label + " has tags out of order")
	const text = doc.getText().replace(/^\s*\* ?/gm, "")
	if (/^@example\b/m.test(text)) failures.push(label + " uses @example instead of an Example section")
	if (/^@see (?:react-foldkit|foldkit)\//m.test(text)) failures.push(label + " has a blanket module @see")
	const sectionOrder = ["When to use", "Details", "Gotchas"]
	const sections = Array.from(text.matchAll(/^\*\*(When to use|Details|Gotchas)\*\*$/gm), (match) => match[1])
	if (
		new Set(sections).size !== sections.length ||
		sections.some(
			(section, index) => index > 0 && sectionOrder.indexOf(section) < sectionOrder.indexOf(sections[index - 1])
		)
	)
		failures.push(label + " has repeated or unordered sections")
	if (/^\*\*Example\*\*(?! \([^\n]+\))/m.test(text)) failures.push(label + " has an untitled example")
	const titles = Array.from(text.matchAll(/^\*\*Example\*\* \(([^\n]+)\)/gm), (match) =>
		match[1].trim().toLowerCase()
	)
	if (new Set(titles).size !== titles.length) failures.push(label + " repeats an example title")
	function checkSymbolLink(node) {
		if (ts.isJSDocLink(node) && node.name && !checker.getSymbolAtLocation(node.name))
			failures.push(label + " links to an unresolved symbol: " + node.name.getText())
		ts.forEachChild(node, checkSymbolLink)
	}
	checkSymbolLink(doc)
}
function referenceAndInventory() {
	const config = ts.parseJsonConfigFileContent(
		ts.readConfigFile(resolve(root, "tsconfig.json"), (path) => ts.sys.readFile(path)).config,
		ts.sys,
		root
	)
	const program = ts.createProgram(config.fileNames, config.options)
	const checker = program.getTypeChecker()
	const failures = []
	for (const source of program.getSourceFiles()) {
		if (!source.fileName.startsWith(root + "/src/")) continue
		function checkReexport(node) {
			if (ts.isExportSpecifier(node) && documentation(node)) {
				const symbol = checker.getSymbolAtLocation(node.name)
				if (symbol && modelDocs(checker, symbol).local.length === 0)
					failures.push(relative(root, source.fileName) + "." + node.name.text + " copies upstream JSDoc")
			}
			ts.forEachChild(node, checkReexport)
		}
		checkReexport(source)
	}
	const inventory = []
	const reference = [
		"# Public API reference",
		"",
		"Generated from the public exports. See the [counter tutorial](examples.md) for usage and [runtime architecture](architecture.md) for ownership. Regenerate with `bun run --filter=react-foldkit docs:generate` from the repository root.",
		"",
		...entries.map(({ entry }) => "- [" + entry + "](#" + entry.replace(/[^\w-]/g, "") + ")"),
		"",
	]
	const seen = new Set()
	for (const { entry, file } of entries) {
		const source = program.getSourceFile(file)
		const exports = checker
			.getExportsOfModule(checker.getSymbolAtLocation(source))
			.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
		reference.push("## " + entry, "")
		for (const symbol of exports) {
			const { target, local, text, inherited } = modelDocs(checker, symbol)
			verifyDocs(checker, symbol, entry + "." + symbol.name, failures, seen)
			inventory.push({
				entryPoint: entry,
				name: symbol.name,
				owner: local.length > 0 ? "react-foldkit" : "foldkit",
				introduced: "0.1.0",
			})
			if (local.length === 0) continue
			const summary =
				inherited ||
				text
					.replace(/^\/\*\*|\*\/$/g, "")
					.replace(/^\s*\* ?/gm, "")
					.replace(/^@.*$/gm, "")
					.trim()
			reference.push("### " + symbol.name, "", summary, "")
			const declaration = target.declarations?.[0]
			if (declaration && !ts.isSourceFile(declaration)) {
				const type =
					target.flags & ts.SymbolFlags.Type
						? checker.getDeclaredTypeOfSymbol(target)
						: checker.getTypeOfSymbolAtLocation(target, declaration)
				if (local.some((node) => ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node))) {
					for (const member of checker.getPropertiesOfType(type)) {
						if (member.name.startsWith("__@")) continue
						const docs = ts.displayPartsToString(member.getDocumentationComment(checker))
						const field = checker.typeToString(
							checker.getTypeOfSymbolAtLocation(member, declaration),
							declaration,
							ts.TypeFormatFlags.NoTruncation
						)
						const heading = "- `" + member.name + "`" + (docs ? " " + docs.replace(/\n/g, "\n  ") : "")
						reference.push(heading + "\n\n  ```ts\n  " + field + "\n  ```", "")
					}
				}
			}
		}
		const upstream = exports.filter((symbol) => modelDocs(checker, symbol).local.length === 0)
		if (upstream.length > 0)
			reference.push(
				"Foldkit reexports inherit their upstream contracts. See [Foldkit documentation](https://foldkit.dev) and the original editor JSDoc.",
				"",
				upstream.map((symbol) => "`" + symbol.name + "`").join(", ") + ".",
				""
			)
	}
	if (failures.length > 0) throw new PublicApiError({ message: failures.join("\n") })
	return { inventory: stringify(inventory, null, "\t") + "\n", reference: reference.join("\n") }
}
function apiSnapshot() {
	const files = ["dist", "eslint/dist"].flatMap((dir) =>
		readdirSync(resolve(root, dir))
			.filter((file) => file.endsWith(".d.ts"))
			.map((file) => dir + "/" + file)
	)
	const declarations = [
		"# Declaration snapshot",
		"",
		"Generated from the build. Run docs:generate after an intentional API change and review this diff. Content hashes and JSDoc are omitted.",
		"",
	]
	for (const file of files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
		const name = file.replace(/-[A-Za-z0-9_-]+\.d\.ts$/, ".implementation.d.ts")
		const text = readFileSync(resolve(root, file), "utf8")
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.replace(/-[A-Za-z0-9_-]+\.js/g, ".implementation.js")
			.replace(/\n\s*\n/g, "\n")
			.trim()
		declarations.push("## " + name, "", "```ts", text, "```", "")
	}
	return declarations.join("\n")
}
function persistOrCheck(file, content) {
	if (file.endsWith(".md"))
		content = content.replace(/^[ \t]+/gm, function (indent) {
			const spaces = indent.replace(/\t/g, "").length
			return " ".repeat((indent.match(/\t/g)?.length ?? 0) * 2 + Math.floor(spaces / 4) * 2 + (spaces % 4))
		})
	const path = resolve(root, "docs/" + file)
	if (mode === "generate") writeFileSync(path, content)
	else if (readFileSync(path, "utf8") !== content)
		throw new PublicApiError({
			message: relative(root, path) + " is stale. Build, then run docs:generate and review the diff.",
		})
}
function checkLinks() {
	const files = [
		resolve(root, "README.md"),
		resolve(root, "eslint/README.md"),
		...readdirSync(resolve(root, "docs"))
			.filter((name) => name.endsWith(".md"))
			.map((name) => resolve(root, "docs", name)),
	]
	for (const file of files) {
		const text = readFileSync(file, "utf8")
		for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
			const target = match[1].replace(/^<|>$/g, "")
			if (/^(?:https?:|mailto:|#)/.test(target)) continue
			if (!existsSync(resolve(dirname(file), target.split("#")[0])))
				throw new PublicApiError({ message: relative(root, file) + " links to missing " + target })
		}
	}
}
const program = Effect.sync(function () {
	if (mode !== "api") {
		const { inventory, reference } = referenceAndInventory()
		persistOrCheck("publicExports.json", inventory)
		persistOrCheck("reference.md", reference)
		checkLinks()
	}
	if (mode === "api" || mode === "generate") persistOrCheck("apiSnapshot.md", apiSnapshot())
}).pipe(Effect.andThen(Effect.log("Public API documentation and declarations verified")))
await Effect.runPromise(program)
