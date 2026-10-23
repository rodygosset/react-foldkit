import { it } from "@effect/vitest"
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { Effect, Option } from "effect"
import React from "react"
import { afterEach, expect } from "vitest"
import * as Engine from "../test/fixtures/managedResource"
import * as Application from "./application"

afterEach(cleanup)

it.live.each([false, true])("owns resources across Activity hide and reveal under StrictMode %s", (strict) =>
	Effect.gen(function* () {
		let acquired = 0
		let released = 0
		const live = new Set<string>()
		const program = Engine.make(
			(id) =>
				Effect.sync(function () {
					const value = `${id}:${++acquired}`
					live.add(value)
					return { id: value }
				}),
			({ id }) =>
				Effect.sync(function () {
					live.delete(id)
					released += 1
				}),
			Option.some("a")
		)
		const App = Application.define(program)
		function View() {
			const model = App.useModel()
			const send = App.useSend()
			return <button onClick={() => send.RequestedRead()}>{model.events.join(",")}</button>
		}
		function Activity({ mode }: { readonly mode: "hidden" | "visible" }) {
			const content = (
				<React.Activity mode={mode}>
					<App.Provider>
						<View />
					</App.Provider>
				</React.Activity>
			)
			return strict ? <React.StrictMode>{content}</React.StrictMode> : content
		}
		const view = render(<Activity mode="visible" />)
		yield* Effect.promise(() => waitFor(() => expect(live.size).toBe(1)))
		const first = acquired
		fireEvent.click(view.getByRole("button"))
		yield* Effect.promise(() =>
			waitFor(() => expect(view.getByRole("button").textContent).toContain(`CompletedReadEngine:a:${first}`))
		)
		view.rerender(<Activity mode="hidden" />)
		yield* Effect.promise(() => waitFor(() => expect(live.size).toBe(0)))
		view.rerender(<Activity mode="visible" />)
		yield* Effect.promise(() => waitFor(() => expect(live.size).toBe(1)))
		expect(acquired).toBeGreaterThan(first)
		fireEvent.click(view.getByRole("button"))
		yield* Effect.promise(() =>
			waitFor(() => expect(view.getByRole("button").textContent).toContain(`CompletedReadEngine:a:${acquired}`))
		)
		expect(view.getByRole("button").textContent).toContain(`CompletedReadEngine:a:${first}`)
		view.unmount()
		yield* Effect.promise(() => waitFor(() => expect(released).toBe(acquired)))
	})
)
