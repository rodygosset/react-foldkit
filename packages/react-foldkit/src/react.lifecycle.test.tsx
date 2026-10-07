import { cleanup, render } from "@testing-library/react"
import { Result, Schema } from "effect"
import React from "react"
import { afterEach, describe, expect, it } from "vitest"
import { defineApplication } from "./react"
import type { CommitError } from "./store"

afterEach(cleanup)

function makeMountingApplication() {
	const handled: Array<number> = []
	const commits: Array<Result.Result<void, CommitError>> = []
	const App = defineApplication({
		Model: Schema.Finite,
		update(_model: number, message: number) {
			handled.push(message)
			return { model: message }
		},
	})
	function Child() {
		const dispatch = App.useDispatch()
		const commit = App.useCommit()
		const model = App.useModel()
		React.useEffect(
			function sendMountMessages() {
				dispatch(1)
				commits.push(commit(2))
			},
			[dispatch, commit]
		)
		return <span>{model}</span>
	}
	return { App, Child, handled, commits }
}

describe("Provider activation", function () {
	it.each([false, true])("accepts child mount effect messages with StrictMode=%s", function (strict) {
		const { App, Child, handled, commits } = makeMountingApplication()
		const tree = (
			<App.Provider init={{ model: 0 }}>
				<Child />
			</App.Provider>
		)
		const view = render(strict ? <React.StrictMode>{tree}</React.StrictMode> : tree)
		expect(handled).toEqual(strict ? [1, 2, 1, 2] : [1, 2])
		expect(commits).toEqual(strict ? [Result.void, Result.void] : [Result.void])
		expect(view.container.textContent).toBe("2")
	})

	it("accepts child mount effect messages after Activity reconnects", function () {
		const { App, Child, handled, commits } = makeMountingApplication()
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
		expect(commits).toEqual([Result.void, Result.void])
		expect(view.container.textContent).toBe("2")
	})
})
