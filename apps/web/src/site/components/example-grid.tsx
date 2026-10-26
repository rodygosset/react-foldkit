import { Link } from "@tanstack/react-router"
import { examples, sourceUrl } from "../examples"

export function ExampleGrid() {
	return (
		<div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{examples.map((example) => (
				<div
					key={example.slug}
					className="surface relative flex flex-col rounded-xl p-6 transition-colors hover:border-foreground/25"
				>
					<Link
						{...example.link}
						className="font-medium after:absolute after:inset-0"
					>
						{example.title}
					</Link>
					<p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{example.blurb}</p>
					<a
						href={sourceUrl(example.source)}
						className="relative mt-4 self-start font-mono text-xs text-muted-foreground hover:text-foreground"
					>
						View source
					</a>
				</div>
			))}
		</div>
	)
}
