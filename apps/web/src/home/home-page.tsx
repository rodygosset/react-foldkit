import { Link } from "@tanstack/react-router"
import { cn } from "@workspace/ui/lib/utils"
import { ArrowRightIcon } from "lucide-react"
import installCommand from "virtual:install-command"
import { Site } from "../site/application"
import { CodeBlock } from "../site/components/code-block"
import { CodeSheet } from "../site/components/code-sheet"
import type { CodeSheetTab } from "../site/components/code-sheet"
import { CopyButton } from "../site/components/copy-button"
import { repositoryUrl } from "../site/examples"
import { firstGuide } from "../site/guides"
import programSnippet from "./hero-counter/program.ts?highlight"
import viewSnippet from "./hero-counter/view.tsx?highlight"
import { LoopDiagram } from "./loop-diagram"
import foldkitViewSnippet from "./view-swap/view-foldkit.ts?highlight"
import reactViewSnippet from "./view-swap/view-react.tsx?highlight"

const heroCode: ReadonlyArray<CodeSheetTab> = [
	{ tab: "program", file: "program.ts", snippet: programSnippet },
	{ tab: "view", file: "view.tsx", snippet: viewSnippet },
]

const features = ["Search", "Cart", "Checkout", "Profile"]

const captions = [
	"Start with one feature. Its state and side effects move into a Program.",
	"Move the next one when you're ready. The rest of the app doesn't notice.",
	"Every view still renders in React, until you swap it.",
]

const primaryButton =
	"inline-flex h-11 items-center gap-2 rounded-full bg-foreground px-6 text-[15px] font-medium text-background transition-colors hover:bg-foreground/85 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
const quietButton =
	"inline-flex h-11 items-center gap-1.5 rounded-full px-5 text-[15px] text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"

function GetStarted() {
	return (
		<Link
			to="/docs/$slug"
			params={{ slug: firstGuide.slug }}
			className={primaryButton}
		>
			Get started
			<ArrowRightIcon className="size-4" />
		</Link>
	)
}

/** Shows the short command and copies the full one, with the peer dependencies. */
function InstallPill(props: { readonly blockId: string; readonly className?: string }) {
	return (
		<div
			className={cn(
				"glass flex h-11 w-fit max-w-full items-center gap-3 rounded-full py-1 pr-1.5 pl-5",
				props.className
			)}
		>
			<code className="min-w-0 flex-1 [scrollbar-width:none] overflow-x-auto text-left font-mono text-[13px] whitespace-nowrap">
				<span className="text-muted-foreground select-none">$ </span>
				npm install react-foldkit
			</code>
			<CopyButton
				blockId={props.blockId}
				text={installCommand.code}
				className="rounded-full"
			/>
		</div>
	)
}

function SceneHeading(props: { readonly title: string; readonly lead: string; readonly className?: string }) {
	return (
		<div className={cn("reveal flex flex-col items-start text-left", props.className)}>
			<h2 className="max-w-3xl text-[clamp(2.5rem,6.5vw,4.75rem)] leading-[1] font-semibold tracking-[-0.045em] text-balance">
				{props.title}
			</h2>
			<p className="mt-6 max-w-xl text-lg leading-relaxed text-balance text-muted-foreground sm:text-xl">
				{props.lead}
			</p>
		</div>
	)
}

function Hero() {
	const send = Site.useSend()

	return (
		<section className="relative overflow-hidden">
			<div
				aria-hidden
				className="top-light pointer-events-none absolute inset-0"
			/>
			<div className="relative mx-auto grid min-h-svh max-w-[1120px] items-center gap-14 px-5 pt-32 pb-20 lg:grid-cols-12 lg:gap-10 lg:pt-28">
				<div className="flex flex-col items-start lg:col-span-5">
					<a
						href={`${repositoryUrl}/blob/main/packages/react-foldkit/CHANGELOG.md`}
						className="glass inline-flex items-center gap-2 rounded-full py-1 pr-3 pl-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
					>
						<span className="size-1.5 rounded-full bg-primary" />
						Experimental. Read the changelog
						<ArrowRightIcon className="size-3" />
					</a>
					<h1 className="mt-8 text-[clamp(2.9rem,5.6vw,4.6rem)] leading-[0.95] font-semibold tracking-[-0.05em] text-balance">
						Leave React one feature at a time.
					</h1>
					<p className="mt-7 max-w-md text-lg leading-relaxed text-muted-foreground">
						React Foldkit runs Foldkit programs inside your React app. Move state and side effects now, and
						swap the views when you're ready.
					</p>
					<div className="mt-10 flex flex-wrap items-center gap-2">
						<GetStarted />
						<a
							href={repositoryUrl}
							className={quietButton}
						>
							GitHub
						</a>
					</div>
					<InstallPill
						blockId="install-hero"
						className="mt-5"
					/>
				</div>

				<div className="relative lg:col-span-7">
					<div
						aria-hidden
						className="grid-backdrop pointer-events-none absolute -inset-16"
					/>
					<div className="hero-card relative rounded-[32px] px-5 pt-6 pb-7 sm:px-8 sm:pt-8">
						<div className="flex items-center justify-between">
							<span className="flex items-center gap-2 text-[13px] text-muted-foreground">
								<span className="size-1.5 animate-pulse rounded-full bg-primary" />
								Live
							</span>
							<button
								type="button"
								className="inline-flex h-8 items-center rounded-full px-3 text-[13px] text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
								onClick={() => send.ClickedShowCode()}
							>
								View the code
							</button>
						</div>
						<LoopDiagram />
					</div>
				</div>
			</div>
			<CodeSheet
				title="Counter source"
				tabs={heroCode}
			/>
		</section>
	)
}

function LogicMovesFirst() {
	return (
		<section className="migrate-stage relative mt-16">
			<div className="migrate-sticky mx-auto flex max-w-[1120px] flex-col justify-center px-5 py-24">
				<SceneHeading
					title="Your logic moves first."
					lead="Wrap one feature in a Program. Its state and side effects leave React, and every view keeps rendering."
				/>
				<div className="mt-14 w-full">
					<div className="mx-auto w-fit rounded-full border border-foreground/10 bg-background px-5 py-2 font-mono text-sm">
						App
					</div>
					<div className="mx-auto h-8 w-px bg-foreground/15" />
					<div className="mx-[12.5%] hidden h-px bg-foreground/15 sm:block" />
					<div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
						{features.map((feature) => (
							<div
								key={feature}
								className="feature-node surface relative rounded-[20px] px-4 py-5 text-left sm:before:absolute sm:before:-top-6 sm:before:left-1/2 sm:before:h-6 sm:before:w-px sm:before:bg-foreground/15"
							>
								<p className="text-[15px] font-medium">{feature}</p>
								<p className="relative mt-1 h-5 text-[13px]">
									<span className="status-react absolute inset-0 text-muted-foreground">
										React state
									</span>
									<span className="status-program absolute inset-0 flex items-center gap-1.5 text-link">
										<span className="size-1.5 rounded-full bg-primary" />
										Foldkit Program
									</span>
								</p>
							</div>
						))}
					</div>
				</div>
				<div className="relative mt-12 min-h-16 w-full max-w-xl text-lg leading-relaxed text-balance text-foreground/80">
					{captions.map((caption) => (
						<p
							key={caption}
							className="migrate-caption"
						>
							{caption}
						</p>
					))}
				</div>
			</div>
		</section>
	)
}

function CodePanel(props: {
	readonly label: string
	readonly file: string
	readonly blockId: string
	readonly snippet: { readonly code: string; readonly html: string }
}) {
	return (
		<div className="surface flex min-w-0 flex-col overflow-hidden rounded-[24px]">
			<div className="flex items-center justify-between border-b border-foreground/10 px-5 py-3">
				<span className="text-sm font-medium">{props.label}</span>
				<span className="font-mono text-xs text-muted-foreground">{props.file}</span>
			</div>
			<CodeBlock
				blockId={props.blockId}
				snippet={props.snippet}
				className="flex-1 rounded-none border-0 bg-transparent"
				scrollClassName="px-5 py-5"
			/>
		</div>
	)
}

function ThenTheView() {
	return (
		<section className="mx-auto max-w-[1120px] px-5 py-32 sm:py-44">
			<SceneHeading
				title="Then the view."
				lead="With the logic in a Program, the React view is a thin layer. Rewrite it for Foldkit. The Program stays exactly as it is."
			/>
			<div className="reveal mt-16 flex flex-col items-start">
				<div className="glass flex items-center gap-2 rounded-full px-4 py-2 text-[13px] whitespace-nowrap">
					<span className="size-1.5 rounded-full bg-primary" />
					Same Program, two views
				</div>
				<div className="ml-6 h-6 w-px bg-foreground/15" />
				<div className="grid w-full gap-4 lg:grid-cols-2">
					<CodePanel
						label="React view"
						file="view.tsx"
						blockId="view-react"
						snippet={reactViewSnippet}
					/>
					<CodePanel
						label="Foldkit view"
						file="view.ts"
						blockId="view-foldkit"
						snippet={foldkitViewSnippet}
					/>
				</div>
			</div>
		</section>
	)
}

function TestedTheSameWay() {
	return (
		<section className="mx-auto flex max-w-[1120px] flex-col items-start px-5 py-32 sm:py-44">
			<SceneHeading
				title="Tested the same way."
				lead="Scene tests run on React views and on Foldkit views. When a feature moves, its test changes one import."
			/>
			<div className="reveal surface mt-16 max-w-full overflow-x-auto rounded-[24px] px-5 py-7 font-mono text-[clamp(0.7rem,2.5vw,1.5rem)] leading-[1.9] whitespace-nowrap sm:px-10 sm:py-9">
				<p className="text-muted-foreground">
					<span className="mr-4 text-red-500/80 select-none">-</span>
					{'import { scene } from "'}
					<span className="text-red-500/80 line-through decoration-red-500/60">react-</span>
					{'foldkit/scene"'}
				</p>
				<p>
					<span className="mr-4 text-link select-none">+</span>
					{'import { scene } from "foldkit/scene"'}
				</p>
			</div>
		</section>
	)
}

function StartWithOneFeature() {
	return (
		<section className="relative overflow-hidden border-t border-foreground/10">
			<div
				aria-hidden
				className="top-light pointer-events-none absolute inset-0"
			/>
			<div className="relative mx-auto flex max-w-[1120px] flex-col items-start px-5 py-32 sm:py-44">
				<SceneHeading
					title="Start with one feature."
					lead="Install React Foldkit, wrap one feature in a Program, and keep shipping."
				/>
				<div className="reveal mt-12 flex w-full flex-col items-start gap-5">
					<InstallPill blockId="install-closing" />
					<div className="flex flex-wrap items-center gap-2">
						<GetStarted />
						<Link
							to="/docs/$slug"
							params={{ slug: "move-to-foldkit" }}
							className={quietButton}
						>
							Read Move to Foldkit
						</Link>
					</div>
				</div>
			</div>
		</section>
	)
}

export function HomePage() {
	return (
		<main>
			<Hero />
			<LogicMovesFirst />
			<ThenTheView />
			<TestedTheSameWay />
			<StartWithOneFeature />
		</main>
	)
}
