import { Link, linkOptions } from "@tanstack/react-router"
import { exampleSlugs, examples } from "../examples"
import type { ExampleSlug } from "../examples"
import { treeUrl } from "../repository"

const exampleLinks = {
	counter: linkOptions({ to: "/examples/counter" }),
	todo: linkOptions({ to: "/examples/todo", search: { filter: "all" } }),
	stopwatch: linkOptions({ to: "/examples/stopwatch" }),
	"api-cache": linkOptions({ to: "/examples/api-cache" }),
	"api-cache-query": linkOptions({ to: "/examples/api-cache-query" }),
	"api-cache-http-api": linkOptions({ to: "/examples/api-cache-http-api" }),
} satisfies Record<ExampleSlug, unknown>

export function ExampleGrid() {
	return (
		<div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{exampleSlugs.map((slug) => (
				<div
					key={slug}
					className="surface relative flex flex-col rounded-xl p-6 transition-colors hover:border-foreground/25"
				>
					<Link
						{...exampleLinks[slug]}
						className="font-medium after:absolute after:inset-0"
					>
						{examples[slug].title}
					</Link>
					<p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{examples[slug].summary}</p>
					<a
						href={treeUrl(examples[slug].source)}
						className="relative mt-4 self-start font-mono text-xs text-muted-foreground hover:text-foreground"
					>
						View source
					</a>
				</div>
			))}
		</div>
	)
}
