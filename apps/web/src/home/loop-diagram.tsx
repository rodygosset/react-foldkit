import { cn } from "@workspace/ui/lib/utils"
import type { CSSProperties, ReactNode } from "react"
import { CountView, Counter, CounterControls } from "./hero-counter/view"

/**
 * The Foldkit loop as a ring. The count in the middle is the View. Each Message sends one dot
 * clockwise through Message, update, and Model, and back into the View when React renders.
 */

const concepts = {
	Message: "https://foldkit.dev/core/messages",
	update: "https://foldkit.dev/core/update",
	Model: "https://foldkit.dev/core/model",
	Command: "https://foldkit.dev/core/commands",
}

/** A full trip around the ring, in milliseconds. Each node lights when the dot reaches it. */
const loopMs = 1600

const timing = (delayMs: number, extra: Record<string, string> = {}): CSSProperties =>
	({ "--delay": `${delayMs}ms`, ...extra }) as CSSProperties

/** Two copies of one animation. Switching between them replays it without remounting. */
const replay = (count: number, base: string): string | undefined =>
	count === 0 ? undefined : count % 2 === 0 ? base : `${base}-again`

function Label(props: { readonly name: keyof typeof concepts }) {
	return (
		<a
			href={concepts[props.name]}
			className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase transition-colors hover:text-foreground"
		>
			{props.name}
		</a>
	)
}

/** A node on the ring, centered on a point given in percent of the ring's square. */
function RingNode(props: {
	readonly x: number
	readonly y: number
	readonly pulse: number
	readonly delayMs: number
	readonly className?: string
	readonly children: ReactNode
}) {
	return (
		<div
			className={cn(
				"absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-foreground/10 bg-background px-3 py-2 text-center",
				replay(props.pulse, "node-pulse"),
				props.className
			)}
			style={{ left: `${props.x}%`, top: `${props.y}%`, ...timing(props.delayMs) }}
		>
			{props.children}
		</div>
	)
}

function CommandStatus(props: { readonly isWaiting: boolean }) {
	return (
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
}

function Diagram() {
	const model = Counter.useModel()
	const pulse = model.messageCount
	const fromCommand = model.lastMessage === "CompletedDelay"
	const startsCommand = model.lastMessage === "ClickedDelayedIncrement" && model.isWaiting

	// A Message from the View starts the dot where the View sits. The Command's result starts at Message.
	const startMs = fromCommand ? 200 : 0
	const quarter = loopMs / 4
	const at = {
		message: fromCommand ? startMs : quarter,
		update: fromCommand ? startMs + quarter : quarter * 2,
		model: fromCommand ? startMs + quarter * 2 : quarter * 3,
		view: fromCommand ? startMs + quarter * 3 : loopMs,
	}

	return (
		<div className="flex flex-col items-center">
			<div className="relative aspect-square w-full max-w-[520px]">
				<svg
					aria-hidden
					viewBox="0 0 400 400"
					className="absolute inset-0 size-full overflow-visible"
				>
					<circle
						cx="200"
						cy="200"
						r="140"
						fill="none"
						className="stroke-foreground/15"
						strokeWidth="1"
					/>
					<line
						x1="340"
						y1="222"
						x2="340"
						y2="292"
						className="hidden stroke-foreground/15 sm:block"
						strokeWidth="1"
					/>
					{pulse > 0 ? (
						<circle
							key={pulse}
							cx="200"
							cy="200"
							r="140"
							fill="none"
							pathLength={100}
							transform="rotate(180 200 200)"
							className="ring-comet"
							style={timing(startMs, {
								"--from": fromCommand ? "-25" : "0",
								"--to": "-95",
								"--duration": `${fromCommand ? loopMs * 0.75 : loopMs}ms`,
							})}
						/>
					) : null}
					{startsCommand ? (
						<line
							key={`command-${pulse}`}
							x1="340"
							y1="222"
							x2="340"
							y2="292"
							pathLength={100}
							className="ring-comet ring-comet-line hidden sm:block"
							style={timing(at.update, { "--from": "30", "--to": "-100", "--duration": "450ms" })}
						/>
					) : null}
				</svg>

				<span className="absolute top-1/2 left-[15%] z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-foreground/10 bg-background px-2 py-0.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
					View
				</span>

				<RingNode
					x={50}
					y={15}
					pulse={pulse}
					delayMs={at.message}
					className="min-w-[44%]"
				>
					<Label name="Message" />
					<p className="mt-0.5 truncate font-mono text-[12px] text-link">
						{model.lastMessage === "" ? "Click a button" : model.lastMessage}
					</p>
				</RingNode>

				<RingNode
					x={85}
					y={50}
					pulse={pulse}
					delayMs={at.update}
					className="rounded-full px-4"
				>
					<Label name="update" />
				</RingNode>

				<RingNode
					x={50}
					y={85}
					pulse={pulse}
					delayMs={at.model}
					className="text-left"
				>
					<Label name="Model" />
					<pre className="mt-0.5 font-mono text-[12px] leading-5">
						{"{ count: "}
						<span className="text-foreground">{model.count}</span>
						{",\n  isWaiting: "}
						<span className={model.isWaiting ? "text-link" : "text-muted-foreground"}>
							{String(model.isWaiting)}
						</span>
						{" }"}
					</pre>
				</RingNode>

				<div
					className={cn(
						"absolute top-[81%] left-[85%] z-10 hidden -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-foreground/10 bg-background px-3 py-2 text-center sm:block",
						model.isWaiting && "command-waiting",
						fromCommand && replay(pulse, "node-pulse")
					)}
				>
					<Label name="Command" />
					<p className="mt-0.5 font-mono text-[12px]">WaitToIncrement</p>
					<div className="mt-0.5">
						<CommandStatus isWaiting={model.isWaiting} />
					</div>
				</div>

				<div
					className={cn("absolute inset-0 flex items-center justify-center", replay(pulse, "count-pop"))}
					style={timing(at.view)}
				>
					<CountView />
				</div>
			</div>

			<div
				className={cn(
					"mt-4 flex items-center gap-3 rounded-full border border-foreground/10 bg-background px-3 py-1.5 sm:hidden",
					model.isWaiting && "command-waiting"
				)}
			>
				<Label name="Command" />
				<span className="font-mono text-[12px]">WaitToIncrement</span>
				<CommandStatus isWaiting={model.isWaiting} />
			</div>
			<div className="mt-6">
				<CounterControls />
			</div>
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
