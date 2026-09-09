import { Button } from "@workspace/ui/components/button"
import { Clock, Duration, Effect, Schema, Stream } from "effect"
import { ReactFoldkit } from "react-foldkit"
import * as Command from "react-foldkit/command"
import { defineMessageUnion } from "react-foldkit/message"
import { evo } from "react-foldkit/struct"
import * as Subscription from "react-foldkit/subscription"
import type * as Update from "react-foldkit/update"
import { ExampleShell } from "../components/example-shell"

const TICK_INTERVAL_MS = 100

// MODEL

const Model = Schema.Struct({
	elapsedMs: Schema.Number,
	isRunning: Schema.Boolean,
	startTime: Schema.Number,
})
type Model = typeof Model.Type

// MESSAGE

const Message = defineMessageUnion({
	ClickedStart: {},
	CompletedDetermineStartTime: {
		startTime: Schema.Number,
	},
	ClickedStop: {},
	ClickedReset: {},
	Ticked: {},
	CompletedDetermineTickTime: {
		elapsedMs: Schema.Number,
	},
})
type Message = typeof Message.Type

type UpdateReturn = Update.Return<Model, Message>

// COMMAND

const DetermineStartTime = Command.define("DetermineStartTime", {
	args: { elapsedMs: Schema.Number },
	messages: [Message.CompletedDetermineStartTime],
	execute: ({ elapsedMs }) =>
		Effect.gen(function* () {
			const now = yield* Clock.currentTimeMillis
			return Message.CompletedDetermineStartTime({ startTime: now - elapsedMs })
		}),
})

const DetermineTickTime = Command.define("DetermineTickTime", {
	args: { startTime: Schema.Number },
	messages: [Message.CompletedDetermineTickTime],
	execute: ({ startTime }) =>
		Effect.gen(function* () {
			const now = yield* Clock.currentTimeMillis
			return Message.CompletedDetermineTickTime({ elapsedMs: now - startTime })
		}),
})

// UPDATE

const update = (model: Model, message: Message): UpdateReturn =>
	Message.match<UpdateReturn>(message, {
		ClickedStart: () => ({
			model,
			commands: [DetermineStartTime({ elapsedMs: model.elapsedMs })],
		}),
		CompletedDetermineStartTime: ({ startTime }) => ({
			model: evo(model, {
				isRunning: () => true,
				startTime: () => startTime,
			}),
		}),
		ClickedStop: () => ({
			model: evo(model, {
				isRunning: () => false,
			}),
		}),
		ClickedReset: () => ({
			model: evo(model, {
				elapsedMs: () => 0,
				isRunning: () => false,
				startTime: () => 0,
			}),
		}),
		Ticked() {
			if (!model.isRunning) return { model }
			return { model, commands: [DetermineTickTime({ startTime: model.startTime })] }
		},
		CompletedDetermineTickTime({ elapsedMs }) {
			if (!model.isRunning) return { model }
			return {
				model: evo(model, {
					elapsedMs: () => elapsedMs,
				}),
			}
		},
	})

// INIT

const init = (): UpdateReturn => ({
	model: {
		elapsedMs: 0,
		isRunning: false,
		startTime: 0,
	},
})

// SUBSCRIPTION

const subscriptions = Subscription.make<Model, Message>()((entry) => ({
	tick: entry(
		{ isRunning: Schema.Boolean },
		{
			modelToDependencies: (model) => ({ isRunning: model.isRunning }),
			dependenciesToStream({ isRunning }) {
				if (!isRunning) return Stream.empty
				return Stream.tick(Duration.millis(TICK_INTERVAL_MS)).pipe(Stream.map(Message.Ticked))
			},
		}
	),
}))

const { Provider, useModel, useDispatch } = ReactFoldkit.make({
	update,
	subscriptions,
})

const floorAndPad = (value: number): string => Math.floor(value).toString().padStart(2, "0")

const formatTime = (ms: number): string => {
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
					dispatch(Message.ClickedReset())
				}}
			>
				Reset
			</Button>
			{isRunning ? (
				<Button
					size="lg"
					onClick={function () {
						dispatch(Message.ClickedStop())
					}}
				>
					Stop
				</Button>
			) : (
				<Button
					size="lg"
					onClick={function () {
						dispatch(Message.ClickedStart())
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
