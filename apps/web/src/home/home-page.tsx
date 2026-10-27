import { Link } from "@tanstack/react-router"
import { ArrowRightIcon, ArrowUpRightIcon } from "lucide-react"
import installCommand from "virtual:install-command"
import { CodeBlock } from "../site/components/code-block"
import { CopyButton } from "../site/components/copy-button"
import { firstGuide } from "../site/guides"
import type { HighlightedSnippet } from "../site/guides"
import { blobUrl } from "../site/repository"
import reactViewSnippet from "./cart/cart.tsx?highlight"
import foldkitViewSnippet from "./cart/view.ts?highlight"
import { HeroCode } from "./hero-code"

/** The store's features. Cart moves first, then Checkout, Search, and Profile. */
const features = ["Search", "Cart", "Checkout", "Profile"]

const captions = [
	"Start with the cart. Its state and side effects move into a Program.",
	"Move checkout when you're ready. Search and profile don't notice.",
	"Every view still renders in React, until you swap it.",
]

/** The imports a team uses while it moves, with the guide for each. */
const entryPoints = [
	{ path: "react-foldkit/program", purpose: "Define a feature's logic", slug: "move-to-foldkit" },
	{ path: "react-foldkit/application", purpose: "Run it under React", slug: "get-started" },
	{ path: "react-foldkit/scene", purpose: "Test it like Foldkit", slug: "scene" },
]

const primaryButton =
	"inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-foreground/85 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
const textLink =
	"inline-flex h-10 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"

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
function InstallCommand(props: { readonly snippetId: string }) {
	return (
		<div className="flex items-center gap-2 font-mono text-[13px] text-muted-foreground">
			<span>
				<span className="select-none">$ </span>
				<span className="text-foreground">npm install react-foldkit</span>
			</span>
			<CopyButton
				snippetId={props.snippetId}
				text={installCommand.code}
				label="Copy install command"
			/>
		</div>
	)
}

function SectionHeading(props: { readonly title: string; readonly lead: string }) {
	return (
		<div className="reveal max-w-xl">
			<h2 className="text-[clamp(1.75rem,3vw,2.25rem)] leading-[1.15] font-semibold tracking-[-0.03em] text-balance">
				{props.title}
			</h2>
			<p className="mt-3 text-base leading-relaxed text-balance text-muted-foreground">{props.lead}</p>
		</div>
	)
}

function Hero() {
	return (
		<section className="mx-auto grid min-h-svh max-w-[1120px] items-center gap-14 px-5 pt-32 pb-20 lg:grid-cols-12 lg:gap-16 lg:pt-28">
			<div className="flex flex-col items-start lg:col-span-5">
				<a
					href={blobUrl("packages/react-foldkit/CHANGELOG.md")}
					className="font-mono text-[12px] text-muted-foreground transition-colors hover:text-foreground"
				>
					v0.1 · experimental
				</a>
				<h1 className="mt-5 text-[clamp(2.4rem,4.2vw,3.4rem)] leading-[1.04] font-semibold tracking-[-0.04em] text-balance">
					Leave React one feature at a time.
				</h1>
				<p className="mt-5 max-w-md text-[17px] leading-relaxed text-muted-foreground">
					Move a feature's state and side effects into a Foldkit Program. React keeps rendering it until you
					swap the view.
				</p>
				<div className="mt-8 flex items-center gap-6">
					<GetStarted />
					<a
						href="https://foldkit.dev"
						className={textLink}
					>
						Read Foldkit's docs
						<ArrowUpRightIcon className="size-3.5" />
					</a>
				</div>
				<div className="mt-6">
					<InstallCommand snippetId="install-hero" />
				</div>
			</div>
			<div className="min-w-0 lg:col-span-7">
				<HeroCode />
			</div>
		</section>
	)
}

function MigrationSection() {
	return (
		<section className="migrate-stage relative border-t border-foreground/10">
			<div className="migrate-sticky mx-auto flex max-w-[1120px] flex-col justify-center px-5 py-24">
				<SectionHeading
					title="Your logic moves first."
					lead="Wrap one feature in a Program. Its state and side effects leave React, and every view keeps rendering."
				/>
				<div className="mt-12 w-full">
					<div className="mx-auto w-fit rounded-full border border-foreground/12 px-4 py-1.5 font-mono text-[13px]">
						Store
					</div>
					<div className="mx-auto h-8 w-px bg-foreground/15" />
					<div className="mx-[12.5%] hidden h-px bg-foreground/15 sm:block" />
					<div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
						{features.map((feature) => (
							<div
								key={feature}
								className="feature-node relative rounded-xl border border-foreground/12 px-4 py-4 text-left sm:before:absolute sm:before:-top-6 sm:before:left-1/2 sm:before:h-6 sm:before:w-px sm:before:bg-foreground/15"
							>
								<p className="text-[15px] font-medium">{feature}</p>
								<p
									aria-hidden
									className="relative mt-1 h-5 text-[13px]"
								>
									<span className="status-react absolute inset-0 text-muted-foreground">
										React state
									</span>
									<span className="status-program absolute inset-0 text-c-model">
										Foldkit Program
									</span>
								</p>
							</div>
						))}
					</div>
				</div>
				<div className="relative mt-10 min-h-14 w-full max-w-xl text-base leading-relaxed text-muted-foreground">
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
	readonly snippetId: string
	readonly snippet: HighlightedSnippet
}) {
	return (
		<div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-foreground/12 bg-card">
			<div className="flex items-center justify-between border-b border-foreground/10 px-5 py-3">
				<span className="text-sm font-medium">{props.label}</span>
				<span className="font-mono text-xs text-muted-foreground">{props.file}</span>
			</div>
			<CodeBlock
				snippetId={props.snippetId}
				snippet={props.snippet}
				copyLabel={`Copy ${props.label}`}
				className="flex-1 rounded-none border-0 bg-transparent"
				scrollClassName="max-h-[460px] px-5 py-5"
			/>
		</div>
	)
}

function ViewSection() {
	return (
		<section className="border-t border-foreground/10">
			<div className="mx-auto max-w-[1120px] px-5 py-28 sm:py-32">
				<SectionHeading
					title="Then the view."
					lead="With the cart's logic in a Program, its React view is a thin layer. Rewrite it as a Foldkit view, and keep the Program as it is."
				/>
				<div className="reveal mt-12 grid gap-4 lg:grid-cols-2">
					<CodePanel
						label="React view"
						file="cart.tsx"
						snippetId="view-react"
						snippet={reactViewSnippet}
					/>
					<CodePanel
						label="Foldkit view"
						file="view.ts"
						snippetId="view-foldkit"
						snippet={foldkitViewSnippet}
					/>
				</div>
			</div>
		</section>
	)
}

function TestingSection() {
	return (
		<section className="border-t border-foreground/10">
			<div className="mx-auto max-w-[1120px] px-5 py-28 sm:py-32">
				<SectionHeading
					title="Tested the same way."
					lead="Scene tests run on React views and on Foldkit views. When the cart moves, its test changes one import."
				/>
				<div className="reveal mt-12 max-w-3xl overflow-hidden rounded-xl border border-foreground/12 bg-card">
					<div className="border-b border-foreground/10 px-5 py-3 font-mono text-xs text-muted-foreground">
						cart.test.tsx
					</div>
					<div className="overflow-x-auto py-3 font-mono text-[13px] leading-7 whitespace-nowrap">
						<p className="bg-red-500/8 px-5 text-muted-foreground">
							<span className="mr-4 text-red-500 select-none">-</span>
							{'import { Command, click, expect, given, role, scene } from "react-foldkit/scene"'}
						</p>
						<p className="bg-c-model/10 px-5">
							<span className="mr-4 text-c-model select-none">+</span>
							{'import { Command, click, expect, given, role, scene } from "foldkit/scene"'}
						</p>
						<p className="px-5 text-muted-foreground">
							<span className="mr-4 select-none"> </span>
							{'import { Message, SaveCart, cart, initialModel } from "./program"'}
						</p>
					</div>
				</div>
			</div>
		</section>
	)
}

function InstallSection() {
	return (
		<section className="border-t border-foreground/10">
			<div className="mx-auto grid max-w-[1120px] items-start gap-12 px-5 py-28 sm:py-32 lg:grid-cols-12">
				<div className="lg:col-span-5">
					<SectionHeading
						title="Start with one feature."
						lead="Install React Foldkit, wrap one feature in a Program, and keep shipping."
					/>
					<div className="reveal mt-8 flex flex-col items-start gap-5">
						<InstallCommand snippetId="install-closing" />
						<div className="flex items-center gap-6">
							<GetStarted />
							<Link
								to="/docs/$slug"
								params={{ slug: "move-to-foldkit" }}
								className={textLink}
							>
								Read Move to Foldkit
							</Link>
						</div>
						<p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
							React Foldkit is experimental, and built to be left behind.{" "}
							<Link
								to="/docs/$slug"
								params={{ slug: "limitations" }}
								className="text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground"
							>
								Read the limitations
							</Link>{" "}
							before you adopt it.
						</p>
					</div>
				</div>
				<ul className="reveal divide-y divide-foreground/10 overflow-hidden rounded-xl border border-foreground/12 lg:col-span-6 lg:col-start-7">
					{entryPoints.map((entry) => (
						<li key={entry.path}>
							<Link
								to="/docs/$slug"
								params={{ slug: entry.slug }}
								className="group flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-foreground/[0.03]"
							>
								<span>
									<span className="block font-mono text-[13px]">{entry.path}</span>
									<span className="mt-0.5 block text-[13px] text-muted-foreground">
										{entry.purpose}
									</span>
								</span>
								<ArrowRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
							</Link>
						</li>
					))}
				</ul>
			</div>
		</section>
	)
}

export function HomePage() {
	return (
		<main>
			<Hero />
			<MigrationSection />
			<ViewSection />
			<TestingSection />
			<InstallSection />
		</main>
	)
}
