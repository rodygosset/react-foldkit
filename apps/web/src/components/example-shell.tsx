import { Link } from "@tanstack/react-router"
import { ArrowLeftIcon, ArrowUpRightIcon } from "lucide-react"
import type { ReactNode } from "react"
import { examples } from "../site/examples"
import type { ExampleSlug } from "../site/examples"
import { treeUrl } from "../site/repository"

export function ExampleShell(props: { readonly slug: ExampleSlug; readonly children: ReactNode }) {
	const example = examples[props.slug]

	return (
		<main className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col px-5 pt-24 sm:px-6">
			<header className="flex flex-col gap-4 border-b border-foreground/10 py-8 sm:flex-row sm:items-end sm:justify-between">
				<div className="min-w-0">
					<Link
						to="/examples"
						className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
					>
						<ArrowLeftIcon className="size-3.5" />
						Back to examples
					</Link>
					<h1 className="mt-4 text-4xl font-semibold tracking-[-0.035em]">{example.title}</h1>
					<p className="mt-2 max-w-2xl text-muted-foreground">{example.description}</p>
				</div>
				<a
					href={treeUrl(example.source)}
					className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-full border border-foreground/12 px-4 text-sm font-medium transition-colors hover:bg-foreground/5 sm:self-auto"
				>
					View source
					<ArrowUpRightIcon className="size-3.5" />
				</a>
			</header>
			<div className="flex flex-1 flex-col py-10">{props.children}</div>
		</main>
	)
}
