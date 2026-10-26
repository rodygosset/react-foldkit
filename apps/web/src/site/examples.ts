/** The demos under `/examples`. `ExampleGrid` adds the link to each one. */
export type ExampleSlug = "counter" | "todo" | "stopwatch" | "api-cache" | "api-cache-query" | "api-cache-http-api"

export interface Example {
	readonly title: string
	/** One sentence for the examples index and the page description. */
	readonly summary: string
	/** The lead under the title on the example's own page. */
	readonly description: string
	/** Path from the repository root. */
	readonly source: string
}

/** The order the examples index lists them in. */
export const exampleSlugs: ReadonlyArray<ExampleSlug> = [
	"counter",
	"todo",
	"stopwatch",
	"api-cache",
	"api-cache-query",
	"api-cache-http-api",
]

export const examples: Readonly<Record<ExampleSlug, Example>> = {
	counter: {
		title: "Counter",
		summary: "A Model, three Messages, and a pure update. The smallest Foldkit loop.",
		description: "Buttons send Messages, and update returns the next Model. The view holds no React state.",
		source: "apps/web/src/examples/counter.tsx",
	},
	todo: {
		title: "Todo",
		summary: "AsyncData, Commands, and a filter kept in the URL, all in one update function.",
		description:
			"The list is AsyncData. Commands load and save it, and their Results settle back into the Model. The filter lives in the URL.",
		source: "apps/web/src/examples/todo",
	},
	stopwatch: {
		title: "Stopwatch",
		summary: "A Subscription ticks while the Model says the stopwatch runs.",
		description:
			"A Subscription ticks while isRunning is true. Start and Stop switch the stream on and off without remounting anything.",
		source: "apps/web/src/examples/stopwatch.tsx",
	},
	"api-cache": {
		title: "API cache",
		summary: "AsyncData as the cache, with invalidation, stale data while refetching, and a refetch Subscription.",
		description: "Query client patterns built from ordinary Model state, update logic, and one Subscription.",
		source: "apps/web/src/examples/api-cache",
	},
	"api-cache-query": {
		title: "API cache with Query",
		summary: "The same cache, with Query.define as a Submodel for settling, retries, and deduplication.",
		description:
			"The same cache as the API cache example, with Foldkit Query handling fetch results, retries, deduplication, and keyed entries. The parent Program handles the user's clicks.",
		source: "apps/web/src/examples/api-cache-query.tsx",
	},
	"api-cache-http-api": {
		title: "API cache with HttpApi",
		summary: "Query Commands call a typed HttpApi client that the application Layer supplies.",
		description:
			"Query defines the cache. Its execute Effect reads BlogClient from the application Layer and calls a typed HttpApi endpoint.",
		source: "apps/web/src/examples/api-cache-http-api",
	},
}

/** The `<title>` and description of a demo page. */
export const exampleHead = (slug: ExampleSlug) => ({
	meta: [
		{ title: `${examples[slug].title} · react-foldkit` },
		{ name: "description", content: examples[slug].summary },
	],
})
