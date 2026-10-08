import { afterEach, expect } from "vitest"
import { it } from "@effect/vitest"
import React from "react"
import { cleanup, render, waitFor } from "@testing-library/react"
import { Cause, Effect, Option, Result, Schema, Stream } from "effect"
import { defineApplication } from "./react"
import * as Subscription from "./subscription"
afterEach(cleanup)
it.live("repeated subscription Cause after Activity reconnect", () =>
	Effect.gen(function* () {
		const stream = Stream.die(new Error("same-subscription-defect"))
		const crashes: Cause.Cause<unknown>[] = []
		const reports: Cause.Cause<unknown>[] = []
		const subscriptions = Subscription.make<number, number>()((entry) => ({
			fail: entry({}, { modelToDependencies: () => ({}), dependenciesToStream: () => stream }),
		}))
		const App = defineApplication({
			Model: Schema.Finite,
			update: (model: number, message: number) => ({ model: message }),
			subscriptions,
			onCrash: (cause) => crashes.push(cause),
		})
		let commit: ReturnType<typeof App.useCommit> | undefined
		function View() {
			commit = App.useCommit()
			return <span>{App.useModel()}</span>
		}
		function Tree({ visible }: { visible: boolean }) {
			return (
				<React.Activity mode={visible ? "visible" : "hidden"}>
					<App.Provider
						init={{ model: 0 }}
						onError={(cause) =>
							Effect.sync(function () {
								reports.push(cause)
							})
						}
						renderError={() => <span role="alert">crashed</span>}
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
		expect(Option.getOrThrow(Result.getFailure(commit!(3))).details.reason).toBe("Crashed")
	})
)
