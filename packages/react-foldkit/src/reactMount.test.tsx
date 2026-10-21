import { afterEach, expect, it } from "vitest"
import React from "react"
import { cleanup, render } from "@testing-library/react"
import { Schema } from "effect"
import * as Application from "./application"

afterEach(cleanup)

function fixture(kind: "layout" | "passive" | "ref") {
	const handled: number[] = []
	const App = Application.define({
		Model: Schema.Finite,
		Message: Schema.Finite,
		update(_model: number, message: number) {
			handled.push(message)
			return { model: message }
		},
	})
	function View() {
		const model = App.useModel()
		const dispatch = App.useDispatch()
		const send = React.useCallback(
			function () {
				dispatch(1)
				dispatch(2)
			},
			[dispatch]
		)
		const attach = React.useCallback(
			function (node: HTMLSpanElement | null) {
				if (node) send()
			},
			[send]
		)
		React.useLayoutEffect(
			function sendLayoutMessages() {
				if (kind === "layout") send()
			},
			[send]
		)
		React.useEffect(
			function sendPassiveMessages() {
				if (kind === "passive") send()
			},
			[send]
		)
		return <span ref={kind === "ref" ? attach : undefined}>{model}</span>
	}
	return { App, View, handled }
}
it.each(["layout", "ref"] as const)("initial %s dispatches are delivered", function (kind) {
	const f = fixture(kind)
	const mounted = render(
		<f.App.Provider init={{ model: 0 }}>
			<f.View />
		</f.App.Provider>
	)
	expect(f.handled).toEqual([1, 2])
	expect(mounted.container.textContent).toBe("2")
})
it("passive effect sends are accepted", function () {
	const f = fixture("passive")
	const mounted = render(
		<f.App.Provider init={{ model: 0 }}>
			<f.View />
		</f.App.Provider>
	)
	expect(f.handled).toEqual([1, 2])
	expect(mounted.container.textContent).toBe("2")
})

it.each(["layout", "ref"] as const)("accepts %s sends during StrictMode and Activity reconnect", function (kind) {
	const { App, View, handled } = fixture(kind)
	function Tree({ visible }: { readonly visible: boolean }) {
		return (
			<React.StrictMode>
				<React.Activity mode={visible ? "visible" : "hidden"}>
					<App.Provider init={{ model: 0 }}>
						<View />
					</App.Provider>
				</React.Activity>
			</React.StrictMode>
		)
	}
	const mounted = render(<Tree visible />)
	expect(mounted.container.textContent).toBe("2")
	expect(handled).toEqual([1, 2])
	mounted.rerender(<Tree visible={false} />)
	mounted.rerender(<Tree visible />)
	expect(mounted.container.textContent).toBe("2")
	expect(handled).toEqual([1, 2, 1, 2, 1, 2])
})

it.each(["layout", "ref"] as const)("accepts %s sends during root StrictMode replay", function (kind) {
	const { App, View, handled } = fixture(kind)
	const mounted = render(
		<React.StrictMode>
			<App.Provider init={{ model: 0 }}>
				<View />
			</App.Provider>
		</React.StrictMode>
	)
	expect(mounted.container.textContent).toBe("2")
	expect(handled).toEqual([1, 2, 1, 2])
})
