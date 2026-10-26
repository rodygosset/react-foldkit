import { Link, createFileRoute, notFound } from "@tanstack/react-router"
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react"
import { loaders } from "virtual:guides"
import { GuideContent } from "../../site/components/guide-content"
import { GuideNav } from "../../site/components/guide-nav"
import { findGuide, guides } from "../../site/guides"

export const Route = createFileRoute("/docs/$slug")({
	loader({ params }) {
		const guide = findGuide(params.slug)
		const load = loaders[params.slug]
		if (guide === undefined || load === undefined) throw notFound()
		return load().then(({ default: blocks }) => ({ guide, blocks }))
	},
	head: ({ loaderData }) => ({
		meta:
			loaderData === undefined
				? []
				: [
						{ title: `${loaderData.guide.title} · react-foldkit` },
						{ name: "description", content: loaderData.guide.description },
					],
	}),
	component: GuidePage,
})

function GuidePage() {
	const { guide, blocks } = Route.useLoaderData()
	// Loader data reaches the browser as a copy, so match the guide by slug, not by reference.
	const index = guides.findIndex((candidate) => candidate.slug === guide.slug)
	const previous = index > 0 ? guides.at(index - 1) : undefined
	const next = guides.at(index + 1)

	return (
		<div className="mx-auto flex w-full max-w-[1120px] gap-12 px-5 pt-16 sm:px-6">
			<aside className="hidden w-60 shrink-0 md:block">
				<nav
					aria-label="Guides"
					className="sticky top-20 max-h-[calc(100svh-5rem)] overflow-y-auto py-10"
				>
					<p className="px-3 pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
						Guides
					</p>
					<GuideNav />
				</nav>
			</aside>
			<main className="max-w-[720px] min-w-0 flex-1 py-10 lg:py-14">
				<h1 className="text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">{guide.title}</h1>
				<p className="mt-3 text-lg text-muted-foreground">{guide.description}</p>
				<div className="mt-10">
					<GuideContent
						slug={guide.slug}
						blocks={blocks}
					/>
				</div>
				<nav
					aria-label="Previous and next guides"
					className="mt-16 grid gap-4 border-t pt-8 sm:grid-cols-2"
				>
					{previous === undefined ? (
						<span />
					) : (
						<Link
							to="/docs/$slug"
							params={{ slug: previous.slug }}
							className="surface group rounded-2xl p-4 transition-colors hover:border-foreground/25"
						>
							<span className="flex items-center gap-1 text-xs text-muted-foreground">
								<ArrowLeftIcon className="size-3" />
								Previous
							</span>
							<span className="mt-1 block font-medium group-hover:text-link">{previous.title}</span>
						</Link>
					)}
					{next === undefined ? null : (
						<Link
							to="/docs/$slug"
							params={{ slug: next.slug }}
							className="surface group rounded-2xl p-4 text-right transition-colors hover:border-foreground/25"
						>
							<span className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
								Next
								<ArrowRightIcon className="size-3" />
							</span>
							<span className="mt-1 block font-medium group-hover:text-link">{next.title}</span>
						</Link>
					)}
				</nav>
			</main>
		</div>
	)
}
