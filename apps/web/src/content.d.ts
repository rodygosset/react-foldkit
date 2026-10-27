declare module "virtual:guides" {
	import type { GuideBlock } from "./site/guides"

	export const loaders: Partial<Record<string, () => Promise<{ default: ReadonlyArray<GuideBlock> }>>>
}

declare module "virtual:install-command" {
	import type { HighlightedSnippet } from "./site/guides"

	const command: HighlightedSnippet
	export default command
}

declare module "*?highlight" {
	import type { HighlightedSnippet } from "./site/guides"

	const snippet: HighlightedSnippet
	export default snippet
}
