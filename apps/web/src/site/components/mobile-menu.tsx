import { cn } from "@workspace/ui/lib/utils"
import { MenuIcon, XIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Site } from "../application"

const menuId = "mobile-menu"

/** Opens and closes the phone menu. It only shows below 768px. */
export function MenuButton(props: { readonly className?: string }) {
	const isOpen = Site.useModel((model) => model.isMenuOpen)
	const send = Site.useSend()

	return (
		<button
			type="button"
			aria-label={isOpen ? "Close menu" : "Open menu"}
			aria-expanded={isOpen}
			aria-controls={menuId}
			className={cn(
				"inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
				props.className
			)}
			onClick={() => send.ClickedMenuButton()}
		>
			{isOpen ? <XIcon className="size-4" /> : <MenuIcon className="size-4" />}
		</button>
	)
}

/** The phone menu panel. The site Program closes it on Escape and when the page changes. */
export function MobileMenu(props: { readonly children: ReactNode }) {
	const isOpen = Site.useModel((model) => model.isMenuOpen)

	return isOpen ? (
		<nav
			id={menuId}
			aria-label="Site"
			className="fixed inset-x-0 top-14 bottom-0 z-40 overflow-y-auto border-t bg-background px-4 py-6 md:hidden"
		>
			{props.children}
		</nav>
	) : null
}
