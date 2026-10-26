import * as Application from "react-foldkit/application"
import { counter } from "./program"

export const Counter = Application.define(counter, {
	restartInterrupted: (command) => command.name === "WaitToIncrement",
})

export function CountView() {
	const count = Counter.useModel((model) => model.count)
	return <output className="hero-count">{count}</output>
}

export function CounterControls() {
	const isWaiting = Counter.useModel((model) => model.isWaiting)
	const send = Counter.useSend()

	return (
		<div className="hero-controls">
			<button onClick={() => send.ClickedIncrement()}>+1</button>
			<button
				disabled={isWaiting}
				onClick={() => send.ClickedDelayedIncrement()}
			>
				{isWaiting ? "Waiting..." : "+1 in a second"}
			</button>
			<button onClick={() => send.ClickedReset()}>Reset</button>
		</div>
	)
}
