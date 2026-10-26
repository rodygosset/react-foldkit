import type * as React from "react"
import { Site } from "../application"
import type { GuideBlock } from "../guides"
import { CodeBlock } from "./code-block"

const isPlainClick = (event: React.MouseEvent): boolean =>
	event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey

/** Renders a guide's HTML. Clicks on links to other site pages go through the site Program. */
export function GuideContent(props: { readonly slug: string; readonly blocks: ReadonlyArray<GuideBlock> }) {
	const send = Site.useSend()

	function handleClick(event: React.MouseEvent<HTMLDivElement>) {
		if (event.defaultPrevented || !isPlainClick(event) || !(event.target instanceof Element)) return
		const href = event.target.closest("a")?.getAttribute("href")
		if (href === undefined || href === null || !href.startsWith("/")) return
		event.preventDefault()
		send.ClickedInternalLink({ href })
	}

	return (
		<div
			className="prose-docs"
			onClick={handleClick}
		>
			{props.blocks.map((block, index) =>
				block.kind === "html" ? (
					<div
						key={index}
						dangerouslySetInnerHTML={{ __html: block.html }}
					/>
				) : (
					<CodeBlock
						key={index}
						blockId={`${props.slug}-${index}`}
						snippet={block}
						className="my-5"
					/>
				)
			)}
		</div>
	)
}
