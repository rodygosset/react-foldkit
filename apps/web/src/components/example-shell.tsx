import { Link } from "@tanstack/react-router"
import { Button } from "@workspace/ui/components/button"
import { ArrowLeftIcon } from "lucide-react"
import type { ReactNode } from "react"

export function ExampleShell(props: {
	title: string
	description: string
	children: ReactNode
}) {
	return (
		<main className="site-atmosphere relative flex min-h-svh flex-col">
			<header className="animate-rise mx-auto flex w-full max-w-lg items-center gap-3 px-6 pt-8">
				<Button
					variant="ghost"
					size="icon-sm"
					nativeButton={false}
					render={<Link to="/" />}
					aria-label="Back to examples"
				>
					<ArrowLeftIcon />
				</Button>
				<div className="min-w-0">
					<p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
						Example
					</p>
					<h1 className="font-heading text-2xl tracking-tight italic">{props.title}</h1>
				</div>
			</header>
			<p
				className="animate-rise mx-auto mt-2 w-full max-w-lg px-6 text-sm text-muted-foreground"
				style={{ animationDelay: "60ms" }}
			>
				{props.description}
			</p>
			<div className="animate-rise flex flex-1 flex-col" style={{ animationDelay: "120ms" }}>
				{props.children}
			</div>
		</main>
	)
}
