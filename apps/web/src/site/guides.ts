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
		description: "What React Foldkit is, how to install it, and how to run a Foldkit Program in React.",
		source: "packages/react-foldkit/README.md",
		section: { from: "What React Foldkit is", to: "Read next" },
	},
	{
		slug: "provider",
		title: "How the Provider runs a Program",
		description: "When work starts and stops, React Activity, changing props, services, and crashes.",
		source: "packages/react-foldkit/docs/provider.md",
	},
	{
		slug: "submodels",
		title: "Give child Programs their own hooks",
		description: "Foldkit Submodels in React components, including children that exist only some of the time.",
		source: "packages/react-foldkit/docs/submodels.md",
	},
	{
		slug: "move-to-foldkit",
		title: "Move to Foldkit",
		description: "Move a React app to Foldkit one feature at a time, without a rewrite.",
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
		description: "How Foldkit's Managed Resources start and stop under a Provider.",
		source: "packages/react-foldkit/docs/managedResources.md",
	},
	{
		slug: "scene",
		title: "Test views with Scene",
		description: "Run Foldkit's Scene tests against React views.",
		source: "packages/react-foldkit/docs/scene.md",
	},
	{
		slug: "devtools",
		title: "Debug with Foldkit DevTools",
		description: "Foldkit's DevTools panel, connected to your React Providers.",
		source: "packages/react-foldkit/docs/devtools.md",
	},
	{
		slug: "limitations",
		title: "Limitations",
		description: "What React Foldkit doesn't do today, so you can decide whether it fits.",
		source: "packages/react-foldkit/docs/limitations.md",
	},
]

export const firstGuide = guides[0]

export const findGuide = (slug: string): Guide | undefined => guides.find((guide) => guide.slug === slug)
