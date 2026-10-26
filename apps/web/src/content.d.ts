declare module "virtual:guides" {
	import type { GuideBlock } from "./site/guides"

	export const loaders: Partial<Record<string, () => Promise<{ default: ReadonlyArray<GuideBlock> }>>>
}

declare module "virtual:install-command" {
	const command: { readonly code: string; readonly html: string }
	export default command
}

declare module "*?highlight" {
	const snippet: { readonly code: string; readonly html: string }
	export default snippet
}
