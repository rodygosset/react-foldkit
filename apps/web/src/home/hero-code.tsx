import { cn } from "@workspace/ui/lib/utils"
import { useState } from "react"
import type * as React from "react"
import { CopyButton } from "../site/components/copy-button"
import type { HighlightedSnippet } from "../site/guides"
import reactViewSnippet from "./cart/cart.tsx?highlight"
import programSnippet from "./cart/program.ts?highlight"
import foldkitViewSnippet from "./cart/view.ts?highlight"

type HeroTab = "program" | "react" | "foldkit"

interface HeroFile {
	readonly file: string
	readonly note: string
	readonly snippet: HighlightedSnippet
}

const tabs: ReadonlyArray<HeroTab> = ["program", "react", "foldkit"]

/** One feature in three files. Switching tabs swaps the view, and the Program stays the same. */
const files: Readonly<Record<HeroTab, HeroFile>> = {
	program: {
		file: "program.ts",
		note: "The cart's state and side effects. Both views run this Program.",
		snippet: programSnippet,
	},
	react: {
		file: "cart.tsx",
		note: "Today. React renders the cart from the Program.",
		snippet: reactViewSnippet,
	},
	foldkit: {
		file: "view.ts",
		note: "Later. A Foldkit view of the same Program replaces it.",
		snippet: foldkitViewSnippet,
	},
}

const tabId = (tab: HeroTab): string => `hero-tab-${tab}`
const panelId = "hero-tab-panel"

/** Moves between tabs with the arrow keys, Home, and End, as the ARIA tabs pattern describes. */
function tabAfterKey(tab: HeroTab, key: string): HeroTab | undefined {
	const index = tabs.indexOf(tab)
	if (key === "ArrowRight") return tabs.at((index + 1) % tabs.length)
	if (key === "ArrowLeft") return tabs.at(index - 1)
	if (key === "Home") return tabs.at(0)
	if (key === "End") return tabs.at(-1)
	return undefined
}

/**
 * The tab only changes which file the hero shows, so it stays React state. Nothing else on the
 * site reads it.
 */
export function HeroCode() {
	const [activeTab, setActiveTab] = useState<HeroTab>("program")
	const active = files[activeTab]

	function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
		const nextTab = tabAfterKey(activeTab, event.key)
		if (nextTab === undefined) return
		event.preventDefault()
		setActiveTab(nextTab)
		document.getElementById(tabId(nextTab))?.focus()
	}

	return (
		<div className="overflow-hidden rounded-xl border border-foreground/12 bg-card">
			<div className="flex items-center border-b border-foreground/10 pr-2 pl-4">
				<div
					role="tablist"
					aria-label="The cart feature"
					className="flex gap-5"
					onKeyDown={handleKeyDown}
				>
					{tabs.map((tab) => (
						<button
							key={tab}
							id={tabId(tab)}
							type="button"
							role="tab"
							aria-selected={tab === activeTab}
							aria-controls={panelId}
							tabIndex={tab === activeTab ? 0 : -1}
							className={cn(
								"-mb-px border-b py-3 font-mono text-[12px] transition-colors focus-visible:text-foreground focus-visible:outline-none",
								tab === activeTab
									? "border-foreground text-foreground"
									: "border-transparent text-muted-foreground hover:text-foreground"
							)}
							onClick={() => setActiveTab(tab)}
						>
							{files[tab].file}
						</button>
					))}
				</div>
				<CopyButton
					snippetId={`hero-${activeTab}`}
					text={active.snippet.code}
					className="ml-auto"
				/>
			</div>
			<div
				id={panelId}
				role="tabpanel"
				aria-labelledby={tabId(activeTab)}
				tabIndex={0}
				className="code-block h-[420px] overflow-auto px-5 py-4 font-mono text-[13px] leading-6"
				dangerouslySetInnerHTML={{ __html: active.snippet.html }}
			/>
			<p className="border-t border-foreground/10 px-5 py-2.5 text-[12px] text-muted-foreground">{active.note}</p>
		</div>
	)
}
