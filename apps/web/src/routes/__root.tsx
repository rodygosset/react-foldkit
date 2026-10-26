import { HeadContent, Scripts, createRootRoute, useRouterState } from "@tanstack/react-router"
import type { ReactNode } from "react"
import appCss from "../styles.css?url"
import { Site } from "../site/application"
import { SiteFooter } from "../site/components/site-footer"
import { SiteNav } from "../site/components/site-nav"
import { Message, snippetCopy } from "../site/program"
import * as SnippetCopy from "../site/snippet-copy"
import { applySavedThemeScript } from "../site/theme"

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "react-foldkit" },
			{
				name: "description",
				content:
					"React Foldkit runs Foldkit programs inside React, so you can move to Foldkit one feature at a time.",
			},
		],
		links: [
			{ rel: "stylesheet", href: appCss },
			{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
			{ rel: "manifest", href: "/manifest.json" },
		],
		scripts: [{ children: applySavedThemeScript }],
	}),
	notFoundComponent: NotFound,
	shellComponent: RootDocument,
})

function NotFound() {
	return (
		<main className="mx-auto flex max-w-[1120px] flex-1 flex-col items-center justify-center px-5 py-40 text-center">
			<p className="font-mono text-5xl font-semibold tracking-tight">404</p>
			<p className="mt-3 text-muted-foreground">This page doesn't exist.</p>
		</main>
	)
}

/** Closes the phone menu whenever the page changes, as the routing guide describes. */
function SyncPath(props: { readonly children: ReactNode }) {
	const pathname = useRouterState({ select: (state) => state.location.pathname })
	Site.useInbound(pathname, () => Message.ChangedPath())
	return props.children
}

function RootDocument(props: { readonly children: ReactNode }) {
	return (
		<html
			lang="en"
			suppressHydrationWarning
		>
			<head>
				<HeadContent />
			</head>
			<body>
				<Site.Provider>
					<SnippetCopy.Provider
						from={Site}
						lift={snippetCopy}
					>
						<SyncPath>
							<div className="flex min-h-svh flex-col">
								<SiteNav />
								<div className="flex flex-1 flex-col">{props.children}</div>
								<SiteFooter />
							</div>
						</SyncPath>
					</SnippetCopy.Provider>
				</Site.Provider>
				<Scripts />
			</body>
		</html>
	)
}
