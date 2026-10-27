/**
 * Builds the docs site's content at build time, so the browser gets HTML and no highlighter.
 *
 * - `virtual:guides` exports a loader for each guide in `src/site/guides.ts`.
 * - `virtual:guide/<slug>` renders one guide's Markdown into HTML and code blocks.
 * - `<file>?highlight` highlights a source file. Lines between `// #region snippet` and
 *   `// #endregion snippet` are shown alone when the markers exist.
 * - `virtual:install-command` reads the install command from the package README.
 */
import { readFile } from "node:fs/promises"
import path from "node:path"
import type { Element, ElementContent, Root as HastRoot } from "hast"
import { toHtml } from "hast-util-to-html"
import { toString } from "hast-util-to-string"
import type { Root as MdastRoot } from "mdast"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import rehypeSlug from "rehype-slug"
import { createHighlighter } from "shiki"
import type { Highlighter, ThemeRegistration } from "shiki"
import { unified } from "unified"
import { visit } from "unist-util-visit"
import type { Plugin } from "vite"
import { guides } from "../src/site/guides.ts"
import type { Guide, GuideBlock } from "../src/site/guides.ts"
import { blobUrl } from "../src/site/repository.ts"

const repositoryRoot = path.resolve(import.meta.dirname, "../../..")
const languages = ["ts", "tsx", "js", "jsx", "json", "sh", "bash", "diff", "md", "yaml"] as const

const guidesId = "virtual:guides"
const guidePrefix = "virtual:guide/"
const installId = "virtual:install-command"

/**
 * The light code theme, built from Foldkit's colors: View blue, Message violet, update amber,
 * Model teal, and Command coral. Dark mode uses `foldkitDark`.
 */
const foldkitLight: ThemeRegistration = {
	name: "foldkit-light",
	type: "light",
	colors: { "editor.background": "#00000000", "editor.foreground": "#1e2331" },
	tokenColors: [
		{
			scope: ["comment", "punctuation.definition.comment"],
			settings: { foreground: "#8a90a0", fontStyle: "italic" },
		},
		{
			scope: [
				"keyword",
				"storage",
				"storage.type",
				"storage.modifier",
				"keyword.operator.new",
				"keyword.operator.expression",
			],
			settings: { foreground: "#7445d1" },
		},
		{ scope: ["string", "string.template", "punctuation.definition.string"], settings: { foreground: "#0d7f72" } },
		{
			scope: ["entity.name.function", "support.function", "meta.function-call entity.name.function"],
			settings: { foreground: "#2867c9" },
		},
		{ scope: ["constant.numeric", "constant.language", "variable.parameter"], settings: { foreground: "#9a6200" } },
		{
			scope: [
				"entity.name.type",
				"support.type",
				"support.class",
				"entity.name.class",
				"entity.name.tag",
				"support.class.component",
			],
			settings: { foreground: "#c2452b" },
		},
		{ scope: ["punctuation", "meta.brace", "keyword.operator"], settings: { foreground: "#5d6474" } },
		{ scope: ["markup.deleted"], settings: { foreground: "#c2452b" } },
		{ scope: ["markup.inserted"], settings: { foreground: "#0d7f72" } },
	],
}

/**
 * The dark code theme from the Foldkit website, `0x96f-dark` in its `shikiTheme.ts`. The site's
 * CSS sets the code background, so only the token colors apply.
 */
const foldkitDark: ThemeRegistration = {
	name: "foldkit-dark",
	type: "dark",
	colors: { "editor.background": "#1c1a20", "editor.foreground": "#E0DEE6" },
	tokenColors: [
		{ scope: ["comment", "punctuation.definition.comment"], settings: { foreground: "#8A869C" } },
		{ scope: ["keyword", "storage", "storage.type"], settings: { foreground: "#FF7272" } },
		{ scope: ["keyword.control.import", "keyword.control.from"], settings: { foreground: "#FF7272" } },
		{ scope: ["string", "punctuation.definition.string"], settings: { foreground: "#BCDF59" } },
		{
			scope: ["constant", "constant.numeric", "variable.language", "support.constant"],
			settings: { foreground: "#49CAE4" },
		},
		{ scope: ["entity.name", "entity.name.function", "support.function"], settings: { foreground: "#A093E2" } },
		{ scope: ["variable.parameter", "variable.other"], settings: { foreground: "#FFCA58" } },
		{ scope: ["entity.name.type", "support.type", "support.class"], settings: { foreground: "#49CAE4" } },
		{ scope: ["entity.name.tag"], settings: { foreground: "#BCDF59" } },
		{ scope: ["entity.other.attribute-name"], settings: { foreground: "#FFCA58" } },
		{ scope: ["punctuation", "keyword.operator"], settings: { foreground: "#9E9BAA" } },
		{ scope: ["variable.other.property"], settings: { foreground: "#E0DEE6" } },
	],
}

let highlighterPromise: Promise<Highlighter> | undefined

const getHighlighter = () =>
	(highlighterPromise ??= createHighlighter({ themes: [foldkitLight, foldkitDark], langs: [...languages] }))

async function highlight(code: string, lang: string): Promise<string> {
	const highlighter = await getHighlighter()
	const known = (languages as ReadonlyArray<string>).includes(lang)
	return highlighter.codeToHtml(code, {
		lang: known ? lang : "text",
		themes: { light: "foldkit-light", dark: "foldkit-dark" },
		defaultColor: false,
	})
}

/** Keeps the lines between the snippet markers, without their shared indentation. */
function extractSnippet(source: string): string {
	const lines = source.split("\n")
	const start = lines.findIndex((line) => line.trim() === "// #region snippet")
	const end = lines.findIndex((line) => line.trim() === "// #endregion snippet")
	if (start === -1 || end <= start) return source.trimEnd()
	const kept = lines.slice(start + 1, end)
	const indent = Math.min(...kept.filter((line) => line.trim() !== "").map((line) => /^\s*/.exec(line)![0].length))
	return kept
		.map((line) => line.slice(indent))
		.join("\n")
		.trimEnd()
}

/** Cuts a README down to a guide's section, or drops a guide's top-level heading. */
function selectMarkdown(markdown: string, guide: Guide): string {
	const lines = markdown.split("\n")
	if (guide.section === undefined) {
		const heading = lines.findIndex((line) => line.startsWith("# "))
		return heading === -1 ? markdown : [...lines.slice(0, heading), ...lines.slice(heading + 1)].join("\n")
	}
	const from = lines.indexOf(`## ${guide.section.from}`)
	const to = lines.indexOf(`## ${guide.section.to}`)
	if (from === -1 || to <= from) {
		throw new Error(`The ${guide.source} sections "${guide.section.from}" and "${guide.section.to}" were not found`)
	}
	return lines.slice(from, to).join("\n")
}

/** Points links to other guides at their site pages, and every other relative link at GitHub. */
function rewriteLinks(tree: MdastRoot, guide: Guide): void {
	visit(tree, "link", function (node) {
		if (/^[a-z]+:/i.test(node.url) || node.url.startsWith("#")) return
		const [target = "", hash = ""] = node.url.split("#")
		const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(guide.source), target))
		const site = guides.find((candidate) => candidate.source === resolved)
		const suffix = hash === "" ? "" : `#${hash}`
		node.url = site === undefined ? `${blobUrl(resolved)}${suffix}` : `/docs/${site.slug}${suffix}`
	})
}

const isCodeBlock = (node: ElementContent): node is Element => node.type === "element" && node.tagName === "pre"

function codeLanguage(pre: Element): string {
	const code = pre.children.find((child): child is Element => child.type === "element" && child.tagName === "code")
	const classes = code?.properties.className
	const language = Array.isArray(classes)
		? classes.map(String).find((name) => name.startsWith("language-"))
		: undefined
	return language?.slice("language-".length) ?? "text"
}

async function renderGuide(guide: Guide): Promise<ReadonlyArray<GuideBlock>> {
	const markdown = await readFile(path.join(repositoryRoot, guide.source), "utf8")
	const processor = unified()
		.use(remarkParse)
		.use(remarkGfm)
		.use(() => (tree: MdastRoot) => rewriteLinks(tree, guide))
		.use(remarkRehype)
		.use(rehypeSlug)
	const tree: HastRoot = await processor.run(processor.parse(selectMarkdown(markdown, guide)))
	const blocks: Array<GuideBlock> = []
	let pending: Array<ElementContent> = []
	function flush() {
		const html = toHtml({ type: "root", children: pending }).trim()
		if (html !== "") blocks.push({ kind: "html", html })
		pending = []
	}
	for (const node of tree.children as Array<ElementContent>) {
		if (!isCodeBlock(node)) {
			pending.push(node)
			continue
		}
		flush()
		const code = toString(node).replace(/\n$/, "")
		blocks.push({ kind: "code", code, html: await highlight(code, codeLanguage(node)) })
	}
	flush()
	return blocks
}

async function readInstallCommand(): Promise<string> {
	const readme = await readFile(path.join(repositoryRoot, "packages/react-foldkit/README.md"), "utf8")
	const command = /^npm install react-foldkit .*$/m.exec(readme)?.[0]
	if (command === undefined) throw new Error("The package README has no npm install command")
	return command
}

export const content = (): Plugin => ({
	name: "react-foldkit-site-content",
	enforce: "pre",
	resolveId(id) {
		if (id === guidesId || id === installId || id.startsWith(guidePrefix)) return `\0${id}`
		return undefined
	},
	async load(id) {
		if (id === `\0${guidesId}`) {
			const entries = guides.map(
				(guide) =>
					`${JSON.stringify(guide.slug)}: () => import(${JSON.stringify(`${guidePrefix}${guide.slug}`)})`
			)
			return `export const loaders = {${entries.join(",")}}`
		}
		if (id === `\0${installId}`) {
			const command = await readInstallCommand()
			this.addWatchFile(path.join(repositoryRoot, "packages/react-foldkit/README.md"))
			return `export default ${JSON.stringify({ code: command, html: await highlight(command, "sh") })}`
		}
		if (id.startsWith(`\0${guidePrefix}`)) {
			const slug = id.slice(`\0${guidePrefix}`.length)
			const guide = guides.find((candidate) => candidate.slug === slug)
			if (guide === undefined) throw new Error(`Unknown guide ${slug}`)
			this.addWatchFile(path.join(repositoryRoot, guide.source))
			return `export default ${JSON.stringify(await renderGuide(guide))}`
		}
		const [file = "", query] = id.split("?")
		if (query !== "highlight") return undefined
		this.addWatchFile(file)
		const code = extractSnippet(await readFile(file, "utf8"))
		const lang = path.extname(file).slice(1)
		return `export default ${JSON.stringify({ code, html: await highlight(code, lang) })}`
	},
})
