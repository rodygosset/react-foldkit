import { cn } from "@workspace/ui/lib/utils"
import { Option } from "effect"
import { CheckIcon, CopyIcon } from "lucide-react"
import { Site } from "../application"

/** Copies `text` through a Command. The site Program shows "Copied" for this block only. */
export function CopyButton(props: { readonly blockId: string; readonly text: string; readonly className?: string }) {
	const isCopied = Site.useModel((model) => Option.contains(model.copiedBlockId, props.blockId))
	const send = Site.useSend()

	return (
		<button
			type="button"
			aria-label={isCopied ? "Copied" : "Copy code"}
			title={isCopied ? "Copied" : "Copy code"}
			className={cn(
				"inline-flex size-8 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
				isCopied && "text-link",
				props.className
			)}
			onClick={() => send.ClickedCopy({ blockId: props.blockId, text: props.text })}
		>
			{isCopied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
		</button>
	)
}
