/**
 * The guides the docs site renders, in sidebar order. The Vite content plugin reads the same
 * list at build time, so the Markdown in `packages/react-foldkit` stays the only copy.
 */
export interface Guide {
	readonly slug: string
	readonly title: string
	readonly description: string
	/** Path from the repository root. */
	readonly source: string
	/** Renders only the README from the `from` heading up to the `to` heading. */
	readonly section?: { readonly from: string; readonly to: string }
}

/** A rendered guide is HTML split around its code blocks, so each code block gets a copy button. */
export type GuideBlock =
	| { readonly kind: "html"; readonly html: string }
	| { readonly kind: "code"; readonly code: string; readonly html: string }

export const guides: ReadonlyArray<Guide> = [
	{
		slug: "get-started",
		title: "Get started",
		description: "Install React Foldkit and run your first Program in React.",
		source: "packages/react-foldkit/README.md",
		section: { from: "How it works", to: "Read next" },
	},
	{
		slug: "tutorial",
		title: "Build a counter with Commands",
		description: "A step-by-step tutorial that adds a delayed increment as an Effect Command.",
		source: "packages/react-foldkit/docs/examples.md",
	},
	{
		slug: "move-to-foldkit",
		title: "Move to Foldkit",
		description: "What stays the same and what changes when a feature leaves React.",
		source: "packages/react-foldkit/docs/moveToFoldkit.md",
	},
	{
		slug: "routing",
		title: "Use a router",
		description: "Keep the URL and the Model in sync without calling navigate from views.",
		source: "packages/react-foldkit/docs/routing.md",
	},
	{
		slug: "managed-resources",
		title: "Managed Resources",
		description: "Resources that exist only while the Model needs them.",
		source: "packages/react-foldkit/docs/managedResources.md",
	},
	{
		slug: "scene",
		title: "Test views with Scene",
		description: "Run Foldkit Scene tests against React views.",
		source: "packages/react-foldkit/docs/scene.md",
	},
	{
		slug: "devtools",
		title: "Debug with Foldkit DevTools",
		description: "Message history, time travel, and the MCP server.",
		source: "packages/react-foldkit/docs/devtools.md",
	},
]

export const firstGuide = guides[0]

export const findGuide = (slug: string): Guide | undefined => guides.find((guide) => guide.slug === slug)
