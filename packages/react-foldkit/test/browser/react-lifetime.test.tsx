import { it } from "@effect/vitest"
import { Cause, Deferred, Effect, Result, Schema, Stream } from "effect"
import * as Query from "foldkit/experimental/query"
import React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect } from "vitest"
import * as AsyncData from "../../src/asyncData"
import { defineApplication } from "../../src/react"
import * as Subscription from "../../src/subscription"

let root: Root | undefined
let container: HTMLDivElement | undefined

function mount(children: React.ReactNode): HTMLDivElement {
	container = document.createElement("div")
	document.body.append(container)
	root = createRoot(container)
	root.render(children)
	return container
}

afterEach(function () {
	root?.unmount()
	container?.remove()
	root = undefined
	container = undefined
})

describe("React activation with the native browser scheduler", function () {
	it.live.each(["layout", "ref"] as const)("accepts %s Messages under Strict Mode", (phase) =>
		Effect.gen(function* () {
			const commits: Result.Result<void, unknown>[] = []
			const App = defineApplication({
				Model: Schema.Finite,
				update: (_model: number, message: number) => ({ model: message }),
			})
			function View() {
				const model = App.useModel()
				const dispatch = App.useDispatch()
				const commit = App.useCommit()
				const send = React.useCallback(
					function () {
						dispatch(1)
						commits.push(commit(2))
					},
					[dispatch, commit]
				)
				const attach = React.useCallback(
					function (node: HTMLSpanElement | null) {
						if (node !== null) send()
					},
					[send]
				)
				React.useLayoutEffect(
					function sendLayoutMessages() {
						if (phase === "layout") send()
					},
					[send]
				)
				return <span ref={phase === "ref" ? attach : undefined}>{model}</span>
			}
			const view = mount(
				<React.StrictMode>
					<App.Provider init={{ model: 0 }}>
						<View />
					</App.Provider>
				</React.StrictMode>
			)
			yield* Effect.promise(() => expect.poll(() => view.textContent).toBe("2"))
			expect(commits).toEqual([Result.void, Result.void])
		})
	)

	it.live("restarts an interrupted update-started read after Activity reconnects", () =>
		Effect.gen(function* () {
			const response = yield* Deferred.make<number>()
			let starts = 0
			let interrupted = 0
			const query = Query.define({
				name: "BrowserActivityRead",
				data: Schema.Finite,
				error: Schema.String,
				execute: Effect.sync(function () {
					starts += 1
				}).pipe(
					Effect.andThen(Deferred.await(response)),
					Effect.onInterrupt(() =>
						Effect.sync(function () {
							interrupted += 1
						})
					)
				),
			})
			type Model = typeof query.Model.Type
			type Message = typeof query.Message.Type | { readonly _tag: "Load" } | { readonly _tag: "Resume" }
			const App = defineApplication({
				Model: query.Model,
				onReactivate: (): Message => ({ _tag: "Resume" }),
				update(model: Model, message: Message) {
					switch (message._tag) {
						case "Load":
							return query.loadIfMissing(model)
						case "Resume":
							return AsyncData.isPending(query.read(model)) ? query.replace(model) : { model }
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
						onClick={() => dispatch({ _tag: "Load" })}
					>
						{result._tag}
					</button>
				)
			}
			const tree = (mode: "visible" | "hidden") => (
				<React.Activity mode={mode}>
					<App.Provider init={{ model: query.init() }}>
						<View />
					</App.Provider>
				</React.Activity>
			)
			const view = mount(tree("visible"))
			yield* Effect.promise(() => expect.poll(() => view.textContent).toBe("Idle"))
			view.querySelector("button")!.click()
			yield* Effect.promise(() => expect.poll(() => starts).toBe(1))
			expect(view.textContent).toBe("Loading")
			root!.render(tree("hidden"))
			yield* Effect.promise(() => expect.poll(() => interrupted).toBe(1))
			root!.render(tree("visible"))
			yield* Effect.promise(() => expect.poll(() => starts).toBe(2))
			yield* Deferred.succeed(response, 42)
			yield* Effect.promise(() => expect.poll(() => view.textContent).toBe("Success"))
			expect(view.querySelector("button")!.disabled).toBe(false)
		})
	)

	it.live("preserves the terminal update Cause during Activity reactivation", () =>
		Effect.gen(function* () {
			const defect = new Error("Reactivation update failed")
			const reports: Cause.Cause<unknown>[] = []
			const rendered: Cause.Cause<unknown>[] = []
			const App = defineApplication({
				Model: Schema.Finite,
				onReactivate: () => 1,
				update(_model: number, _message: number): { model: number } {
					throw defect
				},
				onCrash() {},
			})
			function View() {
				return <span>{App.useModel()}</span>
			}
			const tree = (mode: "visible" | "hidden") => (
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
			const view = mount(tree("visible"))
			yield* Effect.promise(() => expect.poll(() => view.textContent).toBe("0"))
			root!.render(tree("hidden"))
			yield* Effect.promise(() => expect.poll(() => view.querySelector("span")!.style.display).toBe("none"))
			root!.render(tree("visible"))
			yield* Effect.promise(() => expect.poll(() => reports.length).toBe(1))
			expect(reports).toEqual([Cause.die(defect)])
			yield* Effect.promise(() => expect.poll(() => view.textContent).toBe("Failed"))
			expect(rendered.at(-1)).toEqual(Cause.die(defect))
		})
	)

	it.live.each([false, true])("reports replacement setup failure after a previous crash: %s", (previousCrash) =>
		Effect.gen(function* () {
			const previous = new Error("Previous update failed")
			const current = new Error("Replacement callback failed")
			const reports: Cause.Cause<unknown>[] = []
			const rendered: Cause.Cause<unknown>[] = []
			const App = defineApplication({
				Model: Schema.Finite,
				update(_model: number, _message: number): { model: number } {
					throw previous
				},
				onReactivate(): number {
					throw current
				},
				onCrash() {},
			})
			function View() {
				const dispatch = App.useDispatch()
				return <button onClick={() => dispatch(1)}>Crash</button>
			}
			const tree = (mode: "visible" | "hidden") => (
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
			const view = mount(tree("visible"))
			yield* Effect.promise(() => expect.poll(() => view.textContent).toBe("Crash"))
			if (previousCrash) {
				view.querySelector("button")!.click()
				yield* Effect.promise(() => expect.poll(() => view.textContent).toBe("Failed"))
				expect(reports).toEqual([Cause.die(previous)])
			}
			root!.render(tree("hidden"))
			yield* Effect.promise(() =>
				expect.poll(() => view.querySelector<HTMLElement>("button, span")?.style.display).toBe("none")
			)
			root!.render(tree("visible"))
			const expected = previousCrash ? [Cause.die(previous), Cause.die(current)] : [Cause.die(current)]
			yield* Effect.promise(() => expect.poll(() => reports).toEqual(expected))
			yield* Effect.promise(() => expect.poll(() => view.textContent).toBe("Failed"))
			yield* Effect.promise(() => expect.poll(() => rendered.at(-1)).toEqual(Cause.die(current)))
		})
	)

	it.live("renders and reports a repeated Subscription Cause after recovery", () =>
		Effect.gen(function* () {
			const stream = Stream.die(new Error("Repeated browser failure"))
			const reports: Cause.Cause<unknown>[] = []
			const subscriptions = Subscription.make<number, number>()((entry) => ({
				failure: entry(
					{},
					{
						modelToDependencies: () => ({}),
						dependenciesToStream: () => stream,
					}
				),
			}))
			const App = defineApplication({
				Model: Schema.Finite,
				update: (model: number, _message: number) => ({ model }),
				subscriptions,
				onCrash() {},
			})
			function View() {
				return <span>{App.useModel()}</span>
			}
			const tree = (mode: "visible" | "hidden") => (
				<React.Activity mode={mode}>
					<App.Provider
						init={{ model: 0 }}
						onError={(cause) =>
							Effect.sync(function () {
								reports.push(cause)
							})
						}
						renderError={() => <span>Failed</span>}
					>
						<View />
					</App.Provider>
				</React.Activity>
			)
			const view = mount(tree("visible"))
			yield* Effect.promise(() => expect.poll(() => reports.length).toBe(1))
			expect(view.textContent).toBe("Failed")
			root!.render(tree("hidden"))
			yield* Effect.promise(() => expect.poll(() => view.querySelector("span")!.style.display).toBe("none"))
			root!.render(tree("visible"))
			yield* Effect.promise(() => expect.poll(() => reports.length).toBe(2))
			expect(reports[0]).toBe(reports[1])
			expect(view.textContent).toBe("Failed")
		})
	)
})
