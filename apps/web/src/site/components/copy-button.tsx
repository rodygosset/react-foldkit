import { cn } from "@workspace/ui/lib/utils"
import { Option } from "effect"
import { CheckIcon, CopyIcon } from "lucide-react"
import * as SnippetCopy from "../snippet-copy"

/**
 * Copies `text` through a Command. The snippet copy Submodel shows "Copied" for this snippet only.
 * `label` names what the button copies, so screen readers can tell copy buttons apart.
 */
export function CopyButton(props: {
	readonly snippetId: string
	readonly text: string
	readonly label: string
	readonly className?: string
}) {
	const isCopied = SnippetCopy.useModel((model) => Option.contains(model.maybeCopiedSnippetId, props.snippetId))
	const send = SnippetCopy.useSend()

	return (
		<button
			type="button"
			aria-label={isCopied ? "Copied" : props.label}
			title={isCopied ? "Copied" : props.label}
			className={cn(
				"inline-flex size-8 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
				isCopied && "text-link",
				props.className
			)}
			onClick={() => send.ClickedCopySnippet({ snippetId: props.snippetId, text: props.text })}
		>
			{isCopied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
		</button>
	)
}
