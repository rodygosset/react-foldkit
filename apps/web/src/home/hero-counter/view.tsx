import * as Application from "react-foldkit/application"
import { counter } from "./program"

const Counter = Application.define(counter, {
	restartInterrupted: (command) => command.name === "WaitToIncrement",
})

function CounterView() {
	const count = Counter.useModel((model) => model.count)
	const isWaiting = Counter.useModel((model) => model.isWaiting)
	const send = Counter.useSend()

	return (
		<div className="hero-counter">
			<output>{count}</output>
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

export function HeroCounter() {
	return (
		<Counter.Provider>
			<CounterView />
		</Counter.Provider>
	)
}
