import { cn } from "@workspace/ui/lib/utils"
import { ArrowUpRightIcon } from "lucide-react"
import type { CSSProperties, ReactNode } from "react"
import { Counter, CounterView } from "./hero-counter/view"

/**
 * The Foldkit loop, running. The counter sits in the View node, and each Message it sends
 * lights the path through Message, update, and Model, then back to the View.
 */

const concepts = {
	Message: "https://foldkit.dev/core/messages",
	update: "https://foldkit.dev/core/update",
	Model: "https://foldkit.dev/core/model",
	Command: "https://foldkit.dev/core/commands",
}

/** Milliseconds after a Message arrives at which each step lights up. */
const steps = { source: 0, message: 150, toUpdate: 300, update: 450, toModel: 600, model: 750, render: 850, view: 1000 }

const delay = (ms: number): CSSProperties => ({ "--delay": `${ms}ms` }) as CSSProperties

function pulseClass(messageCount: number): string | undefined {
	if (messageCount === 0) return undefined
	return messageCount % 2 === 0 ? "node-pulse" : "node-pulse-again"
}

function Label(props: { readonly name: keyof typeof concepts }) {
	return (
		<a
			href={concepts[props.name]}
			className="group inline-flex items-center gap-1 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase transition-colors hover:text-foreground"
		>
			{props.name}
			<ArrowUpRightIcon className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
		</a>
	)
}

/** A connector. It runs down on phones and across on wide screens, and a dot travels along it. */
function FlowLine(props: {
	readonly pulse: number
	readonly at: number
	readonly reverse?: boolean
	readonly branch?: boolean
	readonly className?: string
}) {
	return (
		<span
			aria-hidden
			className={cn(
				"relative block shrink-0 bg-foreground/15",
				props.branch ? "flow-line-branch" : "flow-line-x",
				props.className
			)}
		>
			{props.pulse > 0 ? (
				<span
					key={props.pulse}
					className="flow-dot"
					style={delay(props.at)}
					data-reverse={props.reverse === true ? "" : undefined}
				/>
			) : null}
		</span>
	)
}

function Node(props: {
	readonly pulse: number
	readonly at: number
	readonly className?: string
	readonly children: ReactNode
}) {
	return (
		<div
			className={cn(
				"relative z-10 rounded-2xl border border-foreground/10 bg-background",
				pulseClass(props.pulse),
				props.className
			)}
			style={delay(props.at)}
		>
			{props.children}
		</div>
	)
}

/** The delay Command. It glows while it runs, then sends CompletedDelay back as a Message. */
function CommandStatus(props: { readonly isWaiting: boolean; readonly compact?: boolean }) {
	const status = (
		<span className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
			<span
				className={cn(
					"size-1.5 rounded-full",
					props.isWaiting ? "animate-pulse bg-primary" : "bg-foreground/25"
				)}
			/>
			{props.isWaiting ? "Running" : "Idle"}
		</span>
	)

	if (props.compact === true) {
		return (
			<div
				className={cn(
					"flex items-center gap-3 rounded-full border border-foreground/10 bg-background px-3 py-1.5",
					props.isWaiting && "command-waiting"
				)}
			>
				<span className="font-mono text-[12px]">WaitToIncrement</span>
				{status}
			</div>
		)
	}

	return (
		<div
			className={cn(
				"z-10 min-w-[150px] rounded-2xl border border-foreground/10 bg-background px-4 py-3 text-center",
				props.isWaiting && "command-waiting"
			)}
		>
			<Label name="Command" />
			<p className="mt-1 font-mono text-[13px]">WaitToIncrement</p>
			<div className="mt-1">{status}</div>
		</div>
	)
}

function Diagram() {
	const model = Counter.useModel()
	const pulse = model.messageCount
	const fromCommand = model.lastMessage === "CompletedDelay"
	const startsCommand = model.lastMessage === "ClickedDelayedIncrement" && model.isWaiting

	return (
		<div className="relative flex flex-col items-center lg:flex-row lg:items-center">
			<div
				aria-hidden
				className={cn(
					"absolute right-[110px] bottom-1/2 left-[150px] hidden h-[170px] rounded-t-[40px] border border-b-0 border-foreground/15 lg:block",
					pulseClass(pulse)
				)}
				style={delay(steps.render)}
			>
				<span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-foreground/10 bg-background px-3 py-0.5 font-mono text-[11px] text-muted-foreground">
					React renders the new Model
				</span>
			</div>

			<Node
				pulse={pulse}
				at={steps.view}
				className="w-full max-w-[320px] rounded-[24px] p-6 lg:w-[300px]"
			>
				<div className="mb-5 flex items-center justify-between">
					<span className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
						View
					</span>
					<span className="rounded-full bg-foreground/[0.07] px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
						React
					</span>
				</div>
				<CounterView />
			</Node>

			<FlowLine
				pulse={fromCommand ? 0 : pulse}
				at={steps.source}
				className="h-8 w-px lg:h-px lg:w-auto lg:min-w-6 lg:flex-1"
			/>

			<Node
				pulse={pulse}
				at={steps.message}
				className="min-w-[184px] px-4 py-3 text-center"
			>
				<Label name="Message" />
				<p className="mt-1 font-mono text-[13px] text-link">
					{model.lastMessage === "" ? "Click a button" : model.lastMessage}
				</p>
			</Node>

			<FlowLine
				pulse={pulse}
				at={steps.toUpdate}
				className="h-8 w-px lg:h-px lg:w-auto lg:min-w-6 lg:flex-1"
			/>

			<div className="relative flex flex-col items-center lg:block">
				<Node
					pulse={pulse}
					at={steps.update}
					className="rounded-full px-5 py-2.5 text-center"
				>
					<Label name="update" />
				</Node>
				<div className="mt-2 lg:hidden">
					<CommandStatus
						isWaiting={model.isWaiting}
						compact
					/>
				</div>
				<div className="absolute top-full left-1/2 hidden -translate-x-1/2 flex-col items-center lg:flex">
					<FlowLine
						branch
						pulse={fromCommand || startsCommand ? pulse : 0}
						at={fromCommand ? steps.source : steps.toModel}
						reverse={fromCommand}
						className="h-12 w-px"
					/>
					<CommandStatus isWaiting={model.isWaiting} />
				</div>
			</div>

			<FlowLine
				pulse={pulse}
				at={steps.toModel}
				className="h-8 w-px lg:h-px lg:w-auto lg:min-w-6 lg:flex-1"
			/>

			<Node
				pulse={pulse}
				at={steps.model}
				className="w-full max-w-[320px] rounded-[24px] p-5 lg:w-[220px]"
			>
				<Label name="Model" />
				<pre className="mt-3 font-mono text-[13px] leading-6">
					{"{\n  count: "}
					<span className="text-foreground">{model.count}</span>
					{",\n  isWaiting: "}
					<span className={model.isWaiting ? "text-link" : "text-muted-foreground"}>
						{String(model.isWaiting)}
					</span>
					{"\n}"}
				</pre>
			</Node>
		</div>
	)
}

export function LoopDiagram() {
	return (
		<Counter.Provider>
			<Diagram />
		</Counter.Provider>
	)
}
