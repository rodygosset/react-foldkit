import { cn } from "@workspace/ui/lib/utils"
import { XIcon } from "lucide-react"
import { Site } from "../application"
import type { HeroTab } from "../program"
import { CodeBlock } from "./code-block"

export interface CodeSheetTab {
	readonly tab: HeroTab
	readonly file: string
	readonly snippet: { readonly code: string; readonly html: string }
}

/** A sheet over the page with the hero counter's source. The site Program opens and closes it. */
export function CodeSheet(props: { readonly title: string; readonly tabs: ReadonlyArray<CodeSheetTab> }) {
	const isOpen = Site.useModel((model) => model.isCodeSheetOpen)
	const activeTab = Site.useModel((model) => model.heroTab)
	const send = Site.useSend()
	const active = props.tabs.find((tab) => tab.tab === activeTab) ?? props.tabs.at(0)

	if (!isOpen || active === undefined) return null

	return (
		<div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6">
			<button
				type="button"
				aria-label="Close the code"
				tabIndex={-1}
				className="sheet-backdrop absolute inset-0 cursor-default bg-black/50 backdrop-blur-sm"
				onClick={() => send.ClosedCodeSheet()}
			/>
			<div
				role="dialog"
				aria-modal="true"
				aria-label={props.title}
				className="glass sheet-panel relative flex max-h-[85svh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] bg-background/90 sm:rounded-[28px]"
			>
				<div className="flex items-center gap-1 border-b border-foreground/10 px-3 py-2.5">
					<div
						role="tablist"
						aria-label={props.title}
						className="flex gap-1"
					>
						{props.tabs.map((tab) => (
							<button
								key={tab.tab}
								type="button"
								role="tab"
								aria-selected={tab.tab === active.tab}
								className={cn(
									"h-8 rounded-full px-3 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground",
									tab.tab === active.tab && "bg-foreground/10 text-foreground"
								)}
								onClick={() => send.ChoseHeroTab({ tab: tab.tab })}
							>
								{tab.file}
							</button>
						))}
					</div>
					<button
						type="button"
						aria-label="Close"
						autoFocus
						className="ml-auto inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
						onClick={() => send.ClosedCodeSheet()}
					>
						<XIcon className="size-4" />
					</button>
				</div>
				<CodeBlock
					blockId={`hero-${active.tab}`}
					snippet={active.snippet}
					className="min-h-0 flex-1 rounded-none border-0 bg-transparent"
					scrollClassName="max-h-[70svh] px-5 py-5"
				/>
			</div>
		</div>
	)
}
