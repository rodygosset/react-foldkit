import { cn } from "@workspace/ui/lib/utils"
import { CopyButton } from "./copy-button"

/** Code highlighted at build time by Shiki, with a copy button in the top-right corner. */
export function CodeBlock(props: {
	readonly blockId: string
	readonly snippet: { readonly code: string; readonly html: string }
	readonly className?: string
	/** Classes for the scrolling area, such as a maximum height. */
	readonly scrollClassName?: string
}) {
	return (
		<div className={cn("code-block group relative rounded-lg border bg-muted/40", props.className)}>
			<div
				className={cn("overflow-auto py-4 pr-12 pl-4 font-mono text-[13px] leading-6", props.scrollClassName)}
				dangerouslySetInnerHTML={{ __html: props.snippet.html }}
			/>
			<CopyButton
				blockId={props.blockId}
				text={props.snippet.code}
				className="absolute top-2 right-2 border-border bg-background/90"
			/>
		</div>
	)
}
