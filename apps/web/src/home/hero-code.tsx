import { cn } from "@workspace/ui/lib/utils"
import { Site } from "../site/application"
import { CopyButton } from "../site/components/copy-button"
import type { HeroTab } from "../site/program"
import reactViewSnippet from "./cart/cart.tsx?highlight"
import programSnippet from "./cart/program.ts?highlight"
import foldkitViewSnippet from "./cart/view.ts?highlight"

/** One feature in three files. Switching tabs swaps the view, and the Program stays the same. */
const files: ReadonlyArray<{
	readonly tab: HeroTab
	readonly file: string
	readonly note: string
	readonly snippet: { readonly code: string; readonly html: string }
}> = [
	{
		tab: "program",
		file: "program.ts",
		note: "The cart's state and side effects. Both views run this Program.",
		snippet: programSnippet,
	},
	{
		tab: "react",
		file: "cart.tsx",
		note: "Today. React renders the cart from the Program.",
		snippet: reactViewSnippet,
	},
	{
		tab: "foldkit",
		file: "view.ts",
		note: "Later. A Foldkit view of the same Program replaces it.",
		snippet: foldkitViewSnippet,
	},
]

export function HeroCode() {
	const activeTab = Site.useModel((model) => model.heroTab)
	const send = Site.useSend()
	const active = files.find((file) => file.tab === activeTab) ?? files[0]

	return (
		<div className="overflow-hidden rounded-xl border border-foreground/12 bg-card">
			<div className="flex items-center border-b border-foreground/10 pr-2 pl-4">
				<div
					role="tablist"
					aria-label="The cart feature"
					className="flex gap-5"
				>
					{files.map((file) => (
						<button
							key={file.tab}
							type="button"
							role="tab"
							aria-selected={file.tab === active.tab}
							className={cn(
								"-mb-px border-b py-3 font-mono text-[12px] transition-colors focus-visible:text-foreground focus-visible:outline-none",
								file.tab === active.tab
									? "border-foreground text-foreground"
									: "border-transparent text-muted-foreground hover:text-foreground"
							)}
							onClick={() => send.ChoseHeroTab({ tab: file.tab })}
						>
							{file.file}
						</button>
					))}
				</div>
				<CopyButton
					blockId={`hero-${active.tab}`}
					text={active.snippet.code}
					className="ml-auto"
				/>
			</div>
			<div
				role="tabpanel"
				className="code-block h-[420px] overflow-auto px-5 py-4 font-mono text-[13px] leading-6"
				dangerouslySetInnerHTML={{ __html: active.snippet.html }}
			/>
			<p className="border-t border-foreground/10 px-5 py-2.5 text-[12px] text-muted-foreground">{active.note}</p>
		</div>
	)
}
