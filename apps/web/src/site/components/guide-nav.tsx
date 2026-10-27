import { Link } from "@tanstack/react-router"
import { guides } from "../guides"

/** The guide list. The docs sidebar and the phone menu both render it. */
export function GuideNav() {
	return (
		<ul className="flex flex-col gap-0.5">
			{guides.map((guide) => (
				<li key={guide.slug}>
					<Link
						to="/docs/$slug"
						params={{ slug: guide.slug }}
						className="block rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
						activeProps={{ className: "bg-foreground/[0.06] font-medium text-foreground!" }}
					>
						{guide.title}
					</Link>
				</li>
			))}
		</ul>
	)
}
