import { Button } from "@workspace/ui/components/button"
import { Clock, Duration, Effect, Match, Schema, Stream } from "effect"
import { ReactFoldkit } from "react-foldkit"
import * as Command from "react-foldkit/command"
import { m } from "react-foldkit/message"
import { evo } from "react-foldkit/struct"
import * as Subscription from "react-foldkit/subscription"
import type * as Update from "react-foldkit/update"
import { ExampleShell } from "./components/example-shell"

const TICK_INTERVAL_MS = 100

// MODEL

const Model = Schema.Struct({
	elapsedMs: Schema.Number,
	isRunning: Schema.Boolean,
	startTime: Schema.Number,
})
type Model = typeof Model.Type

// MESSAGE

const ClickedStart = m("ClickedStart")
const CompletedDetermineStartTime = m("CompletedDetermineStartTime", {
	startTime: Schema.Number,
})
const ClickedStop = m("ClickedStop")
const ClickedReset = m("ClickedReset")
const Ticked = m("Ticked")
const CompletedDetermineTickTime = m("CompletedDetermineTickTime", {
	elapsedMs: Schema.Number,
})

const Message = Schema.Union([
	ClickedStart,
	CompletedDetermineStartTime,
	ClickedStop,
	ClickedReset,
	Ticked,
	CompletedDetermineTickTime,
])
type Message = typeof Message.Type

type UpdateReturn = Update.Return<Model, Message>

// COMMAND

const DetermineStartTime = Command.define("DetermineStartTime", {
	args: { elapsedMs: Schema.Number },
	messages: [CompletedDetermineStartTime],
	execute: ({ elapsedMs }) =>
		Effect.gen(function* () {
			const now = yield* Clock.currentTimeMillis
			return CompletedDetermineStartTime({ startTime: now - elapsedMs })
		}),
})

const DetermineTickTime = Command.define("DetermineTickTime", {
	args: { startTime: Schema.Number },
	messages: [CompletedDetermineTickTime],
	execute: ({ startTime }) =>
		Effect.gen(function* () {
			const now = yield* Clock.currentTimeMillis
			return CompletedDetermineTickTime({ elapsedMs: now - startTime })
		}),
})

// UPDATE

const update = (model: Model, message: Message): UpdateReturn =>
	Match.value(message).pipe(
		Match.withReturnType<UpdateReturn>(),
		Match.tagsExhaustive({
			ClickedStart: () => [model, [DetermineStartTime({ elapsedMs: model.elapsedMs })]],
			CompletedDetermineStartTime: ({ startTime }) => [
				evo(model, {
					isRunning: () => true,
					startTime: () => startTime,
				}),
				Command.none,
			],
			ClickedStop: () => [
				evo(model, {
					isRunning: () => false,
				}),
				Command.none,
			],
			ClickedReset: () => [
				evo(model, {
					elapsedMs: () => 0,
					isRunning: () => false,
					startTime: () => 0,
				}),
				Command.none,
			],
			Ticked() {
				if (!model.isRunning) return [model, Command.none]
				return [model, [DetermineTickTime({ startTime: model.startTime })]]
			},
			CompletedDetermineTickTime({ elapsedMs }) {
				if (!model.isRunning) return [model, Command.none]
				return [
					evo(model, {
						elapsedMs: () => elapsedMs,
					}),
					Command.none,
				]
			},
		})
	)

// INIT

const init = (): UpdateReturn => [
	{
		elapsedMs: 0,
		isRunning: false,
		startTime: 0,
	},
	Command.none,
]

// SUBSCRIPTION

const subscriptions = Subscription.make<Model, Message>()((entry) => ({
	tick: entry(
		{ isRunning: Schema.Boolean },
		{
			modelToDependencies: (model) => ({ isRunning: model.isRunning }),
			dependenciesToStream({ isRunning }) {
				if (!isRunning) return Stream.empty
				return Stream.tick(Duration.millis(TICK_INTERVAL_MS)).pipe(Stream.map(Ticked))
			},
		}
	),
}))

const { Provider, useModel, useDispatch } = ReactFoldkit.make({
	schema: Model,
	update,
	subscriptions,
})

function floorAndPad(value: number): string {
	return Math.floor(value).toString().padStart(2, "0")
}

function formatTime(ms: number): string {
	const minutes = floorAndPad(Duration.toMinutes(Duration.millis(ms)))
	const seconds = floorAndPad(Duration.toSeconds(Duration.millis(ms % 60_000)))
	const centiseconds = floorAndPad(Duration.toMillis(Duration.millis(ms % 1000)) / 10)
	return `${minutes}:${seconds}.${centiseconds}`
}

function ElapsedDisplay() {
	const elapsedMs = useModel((model) => model.elapsedMs)

	return <p className="font-mono text-6xl font-bold tracking-tight tabular-nums">{formatTime(elapsedMs)}</p>
}

function Controls() {
	const isRunning = useModel((model) => model.isRunning)
	const dispatch = useDispatch()

	return (
		<div className="flex gap-3">
			<Button
				variant="outline"
				size="lg"
				onClick={function () {
					dispatch(ClickedReset())
				}}
			>
				Reset
			</Button>
			{isRunning ? (
				<Button
					size="lg"
					onClick={function () {
						dispatch(ClickedStop())
					}}
				>
					Stop
				</Button>
			) : (
				<Button
					size="lg"
					onClick={function () {
						dispatch(ClickedStart())
					}}
				>
					Start
				</Button>
			)}
		</div>
	)
}

function View() {
	return (
		<ExampleShell
			title="Stopwatch"
			description="A Subscription ticks while isRunning is true — Start/Stop gates the stream without remounting."
		>
			<div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-8 px-6 pt-10 pb-16">
				<ElapsedDisplay />
				<Controls />
			</div>
		</ExampleShell>
	)
}

export function Stopwatch() {
	return (
		<Provider init={init()}>
			<View />
		</Provider>
	)
}
