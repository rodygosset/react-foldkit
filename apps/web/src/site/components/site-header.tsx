import { Link, useRouterState } from "@tanstack/react-router"
import { cn } from "@workspace/ui/lib/utils"
import { repositoryUrl } from "../examples"
import { firstGuide } from "../guides"
import { GuideNav } from "./guide-nav"
import { MenuButton, MobileMenu } from "./mobile-menu"
import { ThemeToggle } from "./theme-toggle"

const navLinkClass = "text-sm text-muted-foreground transition-colors hover:text-foreground"
const activeNavLinkClass = "text-foreground font-medium"

export function SiteHeader() {
	const pathname = useRouterState({ select: (state) => state.location.pathname })

	return (
		<>
			<header className="sticky top-0 z-50 h-14 border-b bg-background/90 backdrop-blur">
				<div className="mx-auto flex h-full max-w-[1120px] items-center gap-6 px-4 sm:px-6">
					<Link
						to="/"
						className="font-mono text-sm font-semibold tracking-tight"
					>
						react-foldkit
					</Link>
					<nav
						aria-label="Main"
						className="ml-auto hidden items-center gap-6 md:flex"
					>
						<Link
							to="/docs/$slug"
							params={{ slug: firstGuide.slug }}
							className={cn(navLinkClass, pathname.startsWith("/docs") && activeNavLinkClass)}
						>
							Docs
						</Link>
						<Link
							to="/examples"
							className={cn(navLinkClass, pathname.startsWith("/examples") && activeNavLinkClass)}
						>
							Examples
						</Link>
						<a
							href={repositoryUrl}
							className={navLinkClass}
						>
							GitHub
						</a>
					</nav>
					<div className="ml-auto flex items-center gap-2 md:ml-0">
						<ThemeToggle />
						<MenuButton className="md:hidden" />
					</div>
				</div>
			</header>
			<MobileMenu>
				<p className="px-3 pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Docs</p>
				<GuideNav />
				<div className="mt-6 flex flex-col gap-0.5 border-t pt-6">
					<Link
						to="/examples"
						className="rounded-md px-3 py-1.5 text-sm hover:bg-muted"
					>
						Examples
					</Link>
					<a
						href={repositoryUrl}
						className="rounded-md px-3 py-1.5 text-sm hover:bg-muted"
					>
						GitHub
					</a>
				</div>
			</MobileMenu>
		</>
	)
}
