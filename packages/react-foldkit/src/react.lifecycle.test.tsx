import { it as effectIt } from "@effect/vitest"
import { cleanup, render, waitFor } from "@testing-library/react"
import { Effect, Schema } from "effect"
import React from "react"
import { afterEach, describe, expect } from "vitest"
import { defineApplication } from "./react"

afterEach(cleanup)

function makeMountingApplication() {
	const handled: Array<number> = []
	const App = defineApplication({
		Model: Schema.Finite,
		update(_model: number, message: number) {
			handled.push(message)
			return { model: message }
		},
	})
	function Child() {
		const dispatch = App.useDispatch()
		const model = App.useModel()
		React.useEffect(
			function sendMountMessages() {
				dispatch(1)
				dispatch(2)
			},
			[dispatch]
		)
		return <span>{model}</span>
	}
	return { App, Child, handled }
}

describe("Provider activation", function () {
	effectIt.live.each([false, true])("accepts child mount effect messages with StrictMode=%s", (strict) =>
		Effect.gen(function* () {
			const { App, Child, handled } = makeMountingApplication()
			const tree = (
				<App.Provider init={{ model: 0 }}>
					<Child />
				</App.Provider>
			)
			const view = render(strict ? <React.StrictMode>{tree}</React.StrictMode> : tree)
			// The Store defers Messages past its sync drain budget to a later task, which slow
			// runtimes such as coverage instrumentation can reach during the mount effect.
			yield* Effect.promise(() => waitFor(() => expect(handled).toEqual(strict ? [1, 2, 1, 2] : [1, 2])))
			expect(view.container.textContent).toBe("2")
		})
	)

	effectIt.live("accepts child mount effect messages after Activity reconnects", () =>
		Effect.gen(function* () {
			const { App, Child, handled } = makeMountingApplication()
			function Activity(props: { mode: "visible" | "hidden" }) {
				return (
					<React.Activity mode={props.mode}>
						<App.Provider init={{ model: 0 }}>
							<Child />
						</App.Provider>
					</React.Activity>
				)
			}
			const view = render(<Activity mode="visible" />)
			view.rerender(<Activity mode="hidden" />)
			view.rerender(<Activity mode="visible" />)
			yield* Effect.promise(() => waitFor(() => expect(handled).toEqual([1, 2, 1, 2])))
			expect(view.container.textContent).toBe("2")
		})
	)
})
