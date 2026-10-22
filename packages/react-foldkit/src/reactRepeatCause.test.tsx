import { afterEach, expect } from "vitest"
import { ValueMessage, setValue } from "../test/fixtures/valueMessage"
import { it } from "@effect/vitest"
import React from "react"
import { cleanup, render, waitFor } from "@testing-library/react"
import { Cause, Effect, Schema, Stream } from "effect"
import * as Application from "./application"
import * as Subscription from "foldkit/subscription"
afterEach(cleanup)
it.live("repeated subscription Cause after Activity reconnect", () =>
	Effect.gen(function* () {
		const stream = Stream.die(new Error("same-subscription-defect"))
		const crashes: Cause.Cause<unknown>[] = []
		const reports: Cause.Cause<unknown>[] = []
		const subscriptions = Subscription.make<number, ValueMessage>()((entry) => ({
			fail: entry({}, { modelToDependencies: () => ({}), dependenciesToStream: () => stream }),
		}))
		const App = Application.define(
			{
				Model: Schema.Finite,
				Message: ValueMessage,
				update: (model: number, message: ValueMessage) => ({ model: message.value }),
				subscriptions,
			},
			{
				onCrash: (cause) => crashes.push(cause),
			}
		)
		let dispatch: ReturnType<typeof App.useDispatch> | undefined
		function View() {
			dispatch = App.useDispatch()
			return <span>{App.useModel()}</span>
		}
		function Tree({ visible }: { visible: boolean }) {
			return (
				<React.Activity mode={visible ? "visible" : "hidden"}>
					<App.Provider
						init={{ model: 0 }}
						crash={{
							view: () => <span role="alert">crashed</span>,
							report: ({ cause }) =>
								Effect.sync(function () {
									reports.push(cause)
								}),
						}}
					>
						<View />
					</App.Provider>
				</React.Activity>
			)
		}
		const mounted = render(<Tree visible />)
		yield* Effect.promise(() => waitFor(() => expect(crashes.length).toBe(1)))
		expect(mounted.getByRole("alert").textContent).toBe("crashed")
		mounted.rerender(<Tree visible={false} />)
		mounted.rerender(<Tree visible />)
		yield* Effect.promise(() => waitFor(() => expect(crashes.length).toBe(2)))
		expect(crashes[0]).toBe(crashes[1])
		yield* Effect.promise(() => waitFor(() => expect(reports.length).toBe(2)))
		expect(mounted.getByRole("alert").textContent).toBe("crashed")
		expect(mounted.container.textContent).toBe("crashed")
		// A crashed Store ignores further Messages.
		dispatch!(setValue(3))
		expect(crashes).toHaveLength(2)
		expect(mounted.container.textContent).toBe("crashed")
	})
)
