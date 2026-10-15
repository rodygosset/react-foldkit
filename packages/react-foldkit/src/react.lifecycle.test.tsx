import { cleanup, render } from "@testing-library/react"
import { Schema } from "effect"
import React from "react"
import { afterEach, describe, expect, it } from "vitest"
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
	it.each([false, true])("accepts child mount effect messages with StrictMode=%s", function (strict) {
		const { App, Child, handled } = makeMountingApplication()
		const tree = (
			<App.Provider init={{ model: 0 }}>
				<Child />
			</App.Provider>
		)
		const view = render(strict ? <React.StrictMode>{tree}</React.StrictMode> : tree)
		expect(handled).toEqual(strict ? [1, 2, 1, 2] : [1, 2])
		expect(view.container.textContent).toBe("2")
	})

	it("accepts child mount effect messages after Activity reconnects", function () {
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
		expect(handled).toEqual([1, 2, 1, 2])
		expect(view.container.textContent).toBe("2")
	})
})
