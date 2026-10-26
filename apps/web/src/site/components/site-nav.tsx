import { Link, useMatchRoute } from "@tanstack/react-router"
import { cn } from "@workspace/ui/lib/utils"
import { firstGuide } from "../guides"
import { repositoryUrl } from "../repository"
import { GuideNav } from "./guide-nav"
import { MenuButton, MobileMenu } from "./mobile-menu"
import { ThemeButton } from "./theme-button"

const pillLink =
	"inline-flex h-8 items-center rounded-full px-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
const activePillLink = "bg-foreground/10 text-foreground"

/** A floating glass pill. On phones it keeps the wordmark, the theme button, and the menu. */
export function SiteNav() {
	const matchRoute = useMatchRoute()
	const isInDocs = matchRoute({ to: "/docs", fuzzy: true }) !== false
	const isInExamples = matchRoute({ to: "/examples", fuzzy: true }) !== false

	return (
		<>
			<header className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
				<nav
					aria-label="Main"
					className="glass pointer-events-auto flex h-12 w-full max-w-md items-center gap-1 rounded-full pr-2 pl-5 md:w-auto md:max-w-none"
				>
					<Link
						to="/"
						className="mr-auto font-mono text-[13px] font-semibold tracking-tight md:mr-3"
					>
						react-foldkit
					</Link>
					<div className="hidden items-center md:flex">
						<Link
							to="/docs/$slug"
							params={{ slug: firstGuide.slug }}
							className={cn(pillLink, isInDocs && activePillLink)}
						>
							Docs
						</Link>
						<Link
							to="/examples"
							className={cn(pillLink, isInExamples && activePillLink)}
						>
							Examples
						</Link>
						<a
							href={repositoryUrl}
							className={pillLink}
						>
							GitHub
						</a>
						<span className="mx-1.5 h-4 w-px bg-foreground/15" />
					</div>
					<ThemeButton />
					<MenuButton className="md:hidden" />
				</nav>
			</header>
			<MobileMenu>
				<p className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground">Guides</p>
				<GuideNav />
				<div className="mt-2 flex flex-col gap-0.5 border-t border-foreground/10 pt-2">
					<Link
						to="/examples"
						className="rounded-xl px-3 py-2 text-sm hover:bg-foreground/5"
					>
						Examples
					</Link>
					<a
						href={repositoryUrl}
						className="rounded-xl px-3 py-2 text-sm hover:bg-foreground/5"
					>
						GitHub
					</a>
				</div>
			</MobileMenu>
		</>
	)
}
