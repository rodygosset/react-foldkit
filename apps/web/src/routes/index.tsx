import { createFileRoute, Link, linkOptions } from "@tanstack/react-router"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import { ArrowRightIcon } from "lucide-react"

export const Route = createFileRoute("/")({ component: Landing })

const examples = [
	{
		title: "Counter",
		blurb: "Model, Messages, and a pure update — the smallest Foldkit loop.",
		options: linkOptions({ to: "/counter" }),
	},
	{
		title: "Todo",
		blurb: "AsyncData, Commands, and URL Flags — still one update function.",
		options: linkOptions({ to: "/todo", search: { filter: "all" } }),
	},
	{
		title: "Stopwatch",
		blurb: "Subscriptions tick while a Model gate is true — Start/Stop without remounting.",
		options: linkOptions({ to: "/stopwatch" }),
	},
	{
		title: "API Cache",
		blurb: "AsyncData as the cache — invalidate, stale-while-revalidate, and a refetch Subscription.",
		options: linkOptions({ to: "/api-cache" }),
	},
	{
		title: "API Cache (Query)",
		blurb: "The same cache, with Query.define as a Submodel for settle, retry, and dedup.",
		options: linkOptions({ to: "/api-cache-query" }),
	},
]

function Landing() {
	return (
		<main className="site-atmosphere relative flex min-h-svh flex-col">
			<div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-16">
				<div>
					<Badge
						variant="outline"
						className="mb-6"
					>
						React · Elm · Effect
					</Badge>
					<h1 className="text-6xl leading-none font-semibold tracking-tight sm:text-7xl">react-foldkit</h1>
					<p className="mt-5 max-w-sm text-base leading-relaxed text-muted-foreground">
						Foldkit’s TEA vocabulary on React: one Model, typed Messages, and Commands that stay outside the
						view.
					</p>
				</div>

				<Separator className="my-10" />

				<section>
					<p className="mb-4 text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
						Examples
					</p>
					<ul className="flex flex-col gap-3">
						{examples.map(function (example) {
							return (
								<li key={example.options.to}>
									<Button
										variant="outline"
										size="lg"
										className="h-auto w-full flex-col items-stretch gap-1 px-5 py-4 text-left whitespace-normal"
										nativeButton={false}
										render={<Link {...example.options} />}
									>
										<span className="flex items-center justify-between gap-3">
											<span className="text-xl font-semibold tracking-tight">
												{example.title}
											</span>
											<ArrowRightIcon className="size-4 shrink-0 opacity-60 transition-transform group-hover/button:translate-x-0.5" />
										</span>
										<span className="text-sm font-normal text-muted-foreground">
											{example.blurb}
										</span>
									</Button>
								</li>
							)
						})}
					</ul>
				</section>
			</div>
		</main>
	)
}
