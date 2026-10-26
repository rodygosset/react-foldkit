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
						className="block rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						activeProps={{ className: "bg-muted font-medium text-link! hover:text-link" }}
					>
						{guide.title}
					</Link>
				</li>
			))}
		</ul>
	)
}
