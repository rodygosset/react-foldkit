import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { Cause, Deferred, Effect, Schema } from "effect"
import * as Query from "foldkit/experimental/query"
import React from "react"
import { afterEach, expect } from "vitest"
import { it } from "@effect/vitest"
import * as AsyncData from "./asyncData"
import { defineApplication } from "./react"

afterEach(cleanup)

it.live.each([false, true])("restarts pending reads without replaying mutations under StrictMode %s", (strict) =>
	Effect.gen(function* () {
		const gate = Deferred.makeUnsafe<number>()
		const runPromise = Effect.runPromiseWith(yield* Effect.context<never>())
		let runs = 0
		let interrupted = 0
		let writes = 0
		let canceledWrites = 0
		const query = Query.define({
			name: "ActivityQuery",
			data: Schema.Finite,
			error: Schema.String,
			execute: Effect.sync(function () {
				runs += 1
			}).pipe(
				Effect.andThen(Deferred.await(gate)),
				Effect.onInterrupt(() =>
					Effect.sync(function () {
						interrupted += 1
					})
				)
			),
		})
		type Model = typeof query.Model.Type
		type Message =
			typeof query.Message.Type | { readonly _tag: "ClickedLoad" } | { readonly _tag: "ResumedApplication" }
		const App = defineApplication({
			Model: query.Model,
			onReactivate: (): Message => ({ _tag: "ResumedApplication" }),
			update(model: Model, message: Message) {
				switch (message._tag) {
					case "ResumedApplication":
						return AsyncData.isPending(query.read(model)) ? query.replace(model) : { model }
					case "ClickedLoad": {
						const loaded = query.loadIfMissing(model)
						return {
							...loaded,
							commands: [
								...(loaded.commands ?? []),
								{
									name: "Save",
									effect: Effect.sync(function () {
										writes += 1
									}).pipe(
										Effect.andThen(Effect.never),
										Effect.onInterrupt(() =>
											Effect.sync(function () {
												canceledWrites += 1
											})
										)
									),
								},
							],
						}
					}
					default:
						return query.update(model, message)
				}
			},
		})
		function View() {
			const result = query.read(App.useModel())
			const dispatch = App.useDispatch()
			return (
				<button
					disabled={AsyncData.isPending(result)}
					onClick={() => dispatch({ _tag: "ClickedLoad" })}
				>
					{result._tag}
				</button>
			)
		}
		function Activity({ mode }: { readonly mode: "visible" | "hidden" }) {
			const content = (
				<React.Activity mode={mode}>
					<App.Provider init={{ model: query.init() }}>
						<View />
					</App.Provider>
				</React.Activity>
			)
			return strict ? <React.StrictMode>{content}</React.StrictMode> : content
		}
		const view = render(<Activity mode="visible" />)
		fireEvent.click(view.getByRole("button"))
		yield* Effect.promise(() => waitFor(() => expect(runs).toBe(1)))
		expect(view.getByRole("button").textContent).toBe("Loading")
		view.rerender(<Activity mode="hidden" />)
		yield* Effect.promise(() => waitFor(() => expect(interrupted).toBe(1)))
		view.rerender(<Activity mode="visible" />)
		yield* Effect.promise(() => act(() => runPromise(Deferred.succeed(gate, 42))))
		yield* Effect.promise(() => waitFor(() => expect(view.getByRole("button").textContent).toBe("Success")))
		view.rerender(<Activity mode="hidden" />)
		view.rerender(<Activity mode="visible" />)
		expect({
			runs,
			interrupted,
			writes,
			canceledWrites,
			rendered: view.getByRole("button").textContent,
			disabled: (view.getByRole("button") as HTMLButtonElement).disabled,
		}).toEqual({
			runs: 2,
			interrupted: 1,
			writes: 1,
			canceledWrites: 1,
			rendered: "Success",
			disabled: false,
		})
	})
)

it.live("reports the original reactivation update defect and recovers on a later reveal", () =>
	Effect.gen(function* () {
		const defect = new Error("reactivation update failed")
		let shouldFail = false
		const reported: Cause.Cause<unknown>[] = []
		const rendered: Cause.Cause<unknown>[] = []
		const App = defineApplication({
			Model: Schema.Finite,
			onReactivate: () => 1,
			update(model: number, message: number) {
				if (shouldFail) throw defect
				return { model: model + message }
			},
			onCrash() {},
		})
		function View() {
			return <span>{App.useModel()}</span>
		}
		function Activity({ mode }: { readonly mode: "visible" | "hidden" }) {
			return (
				<React.Activity mode={mode}>
					<App.Provider
						init={{ model: 0 }}
						onError={(cause) =>
							Effect.sync(function () {
								reported.push(cause)
							})
						}
						renderError={function (cause) {
							rendered.push(cause)
							return <span>Failed</span>
						}}
					>
						<View />
					</App.Provider>
				</React.Activity>
			)
		}
		const view = render(<Activity mode="visible" />)
		expect(view.container.textContent).toBe("0")
		view.rerender(<Activity mode="hidden" />)
		shouldFail = true
		view.rerender(<Activity mode="visible" />)
		yield* Effect.promise(() => waitFor(() => expect(view.container.textContent).toBe("Failed")))
		expect(reported).toEqual([Cause.die(defect)])
		expect(rendered.length).toBeGreaterThan(0)
		for (const cause of rendered) expect(cause).toEqual(Cause.die(defect))
		view.rerender(<Activity mode="hidden" />)
		shouldFail = false
		view.rerender(<Activity mode="visible" />)
		yield* Effect.promise(() => waitFor(() => expect(view.container.textContent).toBe("1")))
		expect(reported).toEqual([Cause.die(defect)])
	})
)

it.live.each([false, true])("renders a new callback defect after Activity retains previous crash %s", (previousCrash) =>
	Effect.gen(function* () {
		const previous = new Error("previous update defect")
		const current = new Error("replacement callback defect")
		let shouldFail = true
		const reports: Cause.Cause<unknown>[] = []
		const rendered: Cause.Cause<unknown>[] = []
		const App = defineApplication({
			Model: Schema.Finite,
			update(model: number, message: number) {
				if (message === 9) throw previous
				return { model: model + message }
			},
			onReactivate(): number {
				if (shouldFail) throw current
				return 1
			},
			onCrash() {},
		})
		function View() {
			const dispatch = App.useDispatch()
			return <button onClick={() => dispatch(9)}>{App.useModel()}</button>
		}
		function Activity({ mode }: { readonly mode: "visible" | "hidden" }) {
			return (
				<React.Activity mode={mode}>
					<App.Provider
						init={{ model: 0 }}
						onError={(cause) =>
							Effect.sync(function () {
								reports.push(cause)
							})
						}
						renderError={function (cause) {
							rendered.push(cause)
							return <span>Failed</span>
						}}
					>
						<View />
					</App.Provider>
				</React.Activity>
			)
		}
		const view = render(<Activity mode="visible" />)
		if (previousCrash) {
			fireEvent.click(view.getByRole("button"))
			yield* Effect.promise(() => waitFor(() => expect(reports).toEqual([Cause.die(previous)])))
			expect(rendered.at(-1)).toEqual(Cause.die(previous))
		}
		view.rerender(<Activity mode="hidden" />)
		view.rerender(<Activity mode="visible" />)
		const expected = previousCrash ? [Cause.die(previous), Cause.die(current)] : [Cause.die(current)]
		yield* Effect.promise(() => waitFor(() => expect(reports).toEqual(expected)))
		expect(rendered.at(-1)).toEqual(Cause.die(current))
		expect(view.container.textContent).toBe("Failed")
		view.rerender(<Activity mode="hidden" />)
		expect(reports).toEqual(expected)
		shouldFail = false
		view.rerender(<Activity mode="visible" />)
		yield* Effect.promise(() => waitFor(() => expect(view.getByRole("button").textContent).toBe("1")))
		expect(reports).toEqual(expected)
		view.unmount()
		expect(reports).toEqual(expected)
	})
)
