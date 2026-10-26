import { linkOptions } from "@tanstack/react-router"

/** The demos under `/examples`, in the order the index and the home page list them. */
export const examples = [
	{
		slug: "counter",
		title: "Counter",
		blurb: "A Model, three Messages, and a pure update. The smallest Foldkit loop.",
		source: "apps/web/src/examples/counter.tsx",
		link: linkOptions({ to: "/examples/counter" }),
	},
	{
		slug: "todo",
		title: "Todo",
		blurb: "AsyncData, Commands, and a filter kept in the URL, all in one update function.",
		source: "apps/web/src/examples/todo",
		link: linkOptions({ to: "/examples/todo", search: { filter: "all" } }),
	},
	{
		slug: "stopwatch",
		title: "Stopwatch",
		blurb: "A Subscription ticks while the Model says the stopwatch runs.",
		source: "apps/web/src/examples/stopwatch.tsx",
		link: linkOptions({ to: "/examples/stopwatch" }),
	},
	{
		slug: "api-cache",
		title: "API cache",
		blurb: "AsyncData as the cache, with invalidation, stale data while refetching, and a refetch Subscription.",
		source: "apps/web/src/examples/api-cache",
		link: linkOptions({ to: "/examples/api-cache" }),
	},
	{
		slug: "api-cache-query",
		title: "API cache with Query",
		blurb: "The same cache, with Query.define as a Submodel for settling, retries, and deduplication.",
		source: "apps/web/src/examples/api-cache-query.tsx",
		link: linkOptions({ to: "/examples/api-cache-query" }),
	},
	{
		slug: "api-cache-http-api",
		title: "API cache with HttpApi",
		blurb: "Query Commands call a typed HttpApi client that the application Layer supplies.",
		source: "apps/web/src/examples/api-cache-http-api",
		link: linkOptions({ to: "/examples/api-cache-http-api" }),
	},
] as const

export type Example = (typeof examples)[number]

export const repositoryUrl = "https://github.com/rodygosset/react-foldkit"

export const sourceUrl = (path: string): string => `${repositoryUrl}/tree/main/${path}`

/**
 * The `<title>` and description of a demo page. The return type is written out, because the
 * routes call this and `examples` reads the route types.
 */
export function exampleHead(slug: string): {
	readonly meta: Array<{ readonly title: string } | { readonly name: string; readonly content: string }>
} {
	const example = examples.find((candidate: Example) => candidate.slug === slug)!
	return {
		meta: [{ title: `${example.title} · react-foldkit` }, { name: "description", content: example.blurb }],
	}
}
