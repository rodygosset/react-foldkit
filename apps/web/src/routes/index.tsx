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
]

function Landing() {
	return (
		<main className="site-atmosphere relative flex min-h-svh flex-col">
			<div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-16">
				<div className="animate-rise">
					<Badge
						variant="outline"
						className="mb-6"
					>
						React · Elm · Effect
					</Badge>
					<h1 className="font-heading text-7xl leading-none tracking-tight italic sm:text-8xl">
						react-foldkit
					</h1>
					<p className="mt-5 max-w-sm text-base leading-relaxed text-muted-foreground">
						Foldkit’s TEA vocabulary on React: one Model, typed Messages, and Commands that stay outside the
						view.
					</p>
				</div>

				<Separator
					className="animate-rise my-10"
					style={{ animationDelay: "80ms" }}
				/>

				<section
					className="animate-rise"
					style={{ animationDelay: "140ms" }}
				>
					<p className="mb-4 text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
						Examples
					</p>
					<ul className="flex flex-col gap-3">
						{examples.map(function (example, index) {
							return (
								<li
									key={example.options.to}
									style={{ animationDelay: `${180 + index * 60}ms` }}
								>
									<Button
										variant="outline"
										size="lg"
										className="h-auto w-full flex-col items-stretch gap-1 px-5 py-4 text-left whitespace-normal"
										nativeButton={false}
										render={<Link {...example.options} />}
									>
										<span className="flex items-center justify-between gap-3">
											<span className="font-heading text-xl tracking-tight italic">
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
