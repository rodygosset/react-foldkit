import { Link } from "@tanstack/react-router"
import { cn } from "@workspace/ui/lib/utils"
import { ArrowRightIcon, ArrowUpRightIcon } from "lucide-react"
import installCommand from "virtual:install-command"
import { Site } from "../site/application"
import { CodeBlock } from "../site/components/code-block"
import { CopyButton } from "../site/components/copy-button"
import { ExampleGrid } from "../site/components/example-grid"
import { repositoryUrl } from "../site/examples"
import { firstGuide } from "../site/guides"
import type { HeroTab } from "../site/program"
import programSnippet from "./hero-counter/program.ts?highlight"
import viewSnippet from "./hero-counter/view.tsx?highlight"
import { HeroCounter } from "./hero-counter/view"
import step1Snippet from "./migration/step-1.tsx?highlight"
import step2Snippet from "./migration/step-2.ts?highlight"
import step3Snippet from "./migration/step-3.ts?highlight"

const heroTabs: ReadonlyArray<{
	readonly tab: HeroTab
	readonly label: string
	readonly file: string
	readonly snippet: typeof programSnippet
}> = [
	{ tab: "program", label: "Program", file: "program.ts", snippet: programSnippet },
	{ tab: "view", label: "View", file: "view.tsx", snippet: viewSnippet },
]

const migrationSteps = [
	{
		title: "Wrap one feature in a Program",
		body: "Pick one feature. Its state becomes a Model, and its events become Messages. Application.define connects the Program to the React components that already render the feature.",
		snippet: step1Snippet,
	},
	{
		title: "Move side effects into Commands",
		body: "Fetches and timers leave useEffect and event handlers. update returns a Command, and Effect runs it. update stays pure, so a test checks it without a browser.",
		snippet: step2Snippet,
	},
	{
		title: "Swap the React view for a Foldkit view",
		body: "Once the logic lives in Programs, the React view is a thin layer. Replace it with a Foldkit view. The Program, its Commands, and its Scene tests stay as they are.",
		snippet: step3Snippet,
	},
]

const ideas = [
	{
		name: "Model",
		body: "Your app's state, described by a Schema. Views read it, and only update replaces it.",
		href: "https://foldkit.dev/core/model",
	},
	{
		name: "Message",
		body: "A fact about something that happened, such as ClickedAdd. Views send Messages instead of changing state.",
		href: "https://foldkit.dev/core/messages",
	},
	{
		name: "update",
		body: "A pure function from the Model and a Message to the next Model. It runs the same in React, in Foldkit, and in tests.",
		href: "https://foldkit.dev/core/update",
	},
	{
		name: "Command",
		body: "A side effect as a named Effect. update returns it, the runtime runs it, and its result comes back as a Message.",
		href: "https://foldkit.dev/core/commands",
	},
]

const buttonClass =
	"inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"

function SectionHeading(props: { readonly eyebrow: string; readonly title: string; readonly lead: string }) {
	return (
		<div className="max-w-2xl">
			<p className="font-mono text-xs font-medium tracking-wide text-link uppercase">{props.eyebrow}</p>
			<h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{props.title}</h2>
			<p className="mt-4 text-base leading-7 text-muted-foreground">{props.lead}</p>
		</div>
	)
}

function HeroCode() {
	const activeTab = Site.useModel((model) => model.heroTab)
	const send = Site.useSend()
	const active = heroTabs.find((tab) => tab.tab === activeTab) ?? heroTabs[0]

	return (
		<div className="min-w-0">
			<div
				role="tablist"
				aria-label="Counter source"
				className="flex gap-1 border-b px-2"
			>
				{heroTabs.map((tab) => (
					<button
						key={tab.tab}
						type="button"
						role="tab"
						aria-selected={tab.tab === activeTab}
						className={cn(
							"-mb-px border-b-2 border-transparent px-3 py-2.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground",
							tab.tab === activeTab && "border-link text-foreground"
						)}
						onClick={() => send.ChoseHeroTab({ tab: tab.tab })}
					>
						{tab.file}
					</button>
				))}
			</div>
			<CodeBlock
				blockId={`hero-${active.tab}`}
				snippet={active.snippet}
				className="rounded-none border-0 bg-transparent"
				scrollClassName="max-h-[360px]"
			/>
		</div>
	)
}

function Hero() {
	return (
		<section className="mx-auto grid max-w-[1120px] gap-12 px-4 pt-16 pb-20 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:pt-24 lg:pb-28">
			<div className="min-w-0">
				<h1 className="text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">
					Move your React app to Foldkit, one feature at a time.
				</h1>
				<p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
					React Foldkit runs Foldkit programs inside React. Move your state and side effects into Foldkit now,
					then swap React out when you're ready.
				</p>
				<div className="mt-8 flex flex-wrap gap-3">
					<Link
						to="/docs/$slug"
						params={{ slug: firstGuide.slug }}
						className={cn(buttonClass, "bg-primary text-primary-foreground hover:bg-primary/85")}
					>
						Get started
						<ArrowRightIcon className="size-4" />
					</Link>
					<a
						href={repositoryUrl}
						className={cn(buttonClass, "border hover:bg-muted")}
					>
						GitHub
					</a>
				</div>
				<div className="mt-8 flex max-w-xl items-center gap-2 rounded-lg border bg-muted/40 py-1 pr-1 pl-4">
					<code className="min-w-0 flex-1 overflow-x-auto py-2 font-mono text-[13px] whitespace-nowrap">
						<span className="text-muted-foreground select-none">$ </span>
						{installCommand.code}
					</code>
					<CopyButton
						blockId="install"
						text={installCommand.code}
					/>
				</div>
				<p className="mt-4 text-sm text-muted-foreground">
					Experimental. A minor release may break your code.{" "}
					<a
						href={`${repositoryUrl}/blob/main/packages/react-foldkit/CHANGELOG.md`}
						className="text-link underline-offset-4 hover:underline"
					>
						Read the changelog
					</a>
					.
				</p>
			</div>
			<div className="min-w-0 overflow-hidden rounded-lg border">
				<div className="border-b bg-muted/40 px-5 py-6">
					<p className="mb-4 font-mono text-xs text-muted-foreground">Live, running on React Foldkit</p>
					<HeroCounter />
				</div>
				<HeroCode />
			</div>
		</section>
	)
}

function MigrationPath() {
	return (
		<section className="border-t">
			<div className="mx-auto max-w-[1120px] px-4 py-20 sm:px-6 lg:py-28">
				<SectionHeading
					eyebrow="The migration path"
					title="Move one feature at a time"
					lead="You don't rewrite the app. Each feature moves on its own, and React keeps rendering everything else. React Foldkit is the bridge, not the destination."
				/>
				<ol className="mt-14 flex flex-col gap-14">
					{migrationSteps.map((step, index) => (
						<li
							key={step.title}
							className="grid gap-6 lg:grid-cols-[1fr_1.4fr] lg:gap-12"
						>
							<div className="min-w-0">
								<p className="font-mono text-sm text-link">Step {index + 1}</p>
								<h3 className="mt-2 text-xl font-semibold tracking-tight">{step.title}</h3>
								<p className="mt-3 leading-7 text-muted-foreground">{step.body}</p>
							</div>
							<CodeBlock
								blockId={`migration-${index + 1}`}
								snippet={step.snippet}
								className="min-w-0"
							/>
						</li>
					))}
				</ol>
				<Link
					to="/docs/$slug"
					params={{ slug: "move-to-foldkit" }}
					className="mt-12 inline-flex items-center gap-1.5 text-sm font-medium text-link underline-offset-4 hover:underline"
				>
					Read the full guide
					<ArrowRightIcon className="size-4" />
				</Link>
			</div>
		</section>
	)
}

function Ideas() {
	return (
		<section className="border-t">
			<div className="mx-auto max-w-[1120px] px-4 py-20 sm:px-6 lg:py-28">
				<SectionHeading
					eyebrow="The four ideas"
					title="Everything comes from Foldkit"
					lead="React Foldkit adds no concepts of its own. What you learn here is what you use in Foldkit."
				/>
				<div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					{ideas.map((idea) => (
						<a
							key={idea.name}
							href={idea.href}
							className="group flex flex-col rounded-lg border p-5 transition-colors hover:border-link/50"
						>
							<p className="font-mono text-sm font-semibold">{idea.name}</p>
							<p className="mt-3 flex-1 text-sm leading-6 text-muted-foreground">{idea.body}</p>
							<p className="mt-5 inline-flex items-center gap-1 text-sm text-link">
								Read on foldkit.dev
								<ArrowUpRightIcon className="size-3.5" />
							</p>
						</a>
					))}
				</div>
			</div>
		</section>
	)
}

function Examples() {
	return (
		<section className="border-t">
			<div className="mx-auto max-w-[1120px] px-4 py-20 sm:px-6 lg:py-28">
				<SectionHeading
					eyebrow="Examples"
					title="See it run"
					lead="Each example is a React app whose state lives in a Foldkit Program. Open one and read its source next to it."
				/>
				<ExampleGrid />
			</div>
		</section>
	)
}

export function HomePage() {
	return (
		<main>
			<Hero />
			<MigrationPath />
			<Ideas />
			<Examples />
		</main>
	)
}
