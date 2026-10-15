import { it as effectIt } from "@effect/vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Effect, Function, Option, Result, Schema } from "effect"
import React from "react"
import { hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { defineMessageUnion } from "foldkit/message"
import type { ModelSource } from "./modelSource"
import { type CommitSource, defineApplication } from "./react"
import { modifyFields } from "foldkit/struct"
import type * as Update from "foldkit/update"

afterEach(cleanup)

const Model = Schema.Struct({ filter: Schema.String, count: Schema.Finite })
type Model = typeof Model.Type

const Message = defineMessageUnion({
	ChangedFilter: { filter: Schema.String },
	// The development-check tests send non-finite counts to produce an invalid Model.
	// @effect-diagnostics-next-line schemaNumber:off
	ChangedCount: { count: Schema.Number },
	ClickedIncrement: {},
	ClickedExplode: {},
})
type Message = typeof Message.Type

const update = (model: Model, message: Message) =>
	Message.match<Update.Return<Model, Message>>(message, {
		ChangedFilter: ({ filter }) => ({ model: modifyFields(model, { filter: () => filter }) }),
		ChangedCount: ({ count }) => ({ model: { ...model, count } }),
		ClickedIncrement: () => ({ model: modifyFields(model, { count: (count) => count + 1 }) }),
		ClickedExplode() {
			throw new Error("exploded")
		},
	})

describe("useInbound", function () {
	it("sends changed values to update without remounting, and skips the initial value", function () {
		const handled: Array<Message> = []
		const Tracked = defineApplication({
			Model,
			update(model: Model, message: Message) {
				handled.push(message)
				return update(model, message)
			},
		})
		function Sync({ filter }: { readonly filter: string }) {
			Tracked.useInbound(filter, (filter) => Message.ChangedFilter({ filter }))
			return <span data-testid="model">{Tracked.useModel((model) => `${model.filter}:${model.count}`)}</span>
		}
		function Increment() {
			const dispatch = Tracked.useDispatch()
			return <button onClick={() => dispatch(Message.ClickedIncrement())}>increment</button>
		}
		function Tree({ filter }: { readonly filter: string }) {
			return (
				<Tracked.Provider init={{ model: { filter, count: 0 } }}>
					<Sync filter={filter} />
					<Increment />
				</Tracked.Provider>
			)
		}
		const mounted = render(<Tree filter="all" />)
		fireEvent.click(screen.getByRole("button"))
		expect(screen.getByTestId("model").textContent).toBe("all:1")
		mounted.rerender(<Tree filter="done" />)
		// The count survives: the Provider was not remounted.
		expect(screen.getByTestId("model").textContent).toBe("done:1")
		mounted.rerender(<Tree filter="done" />)
		expect(handled.filter((message) => message._tag === "ChangedFilter")).toEqual([
			Message.ChangedFilter({ filter: "done" }),
		])
	})

	it("compares values structurally by default", function () {
		const sent: Array<string> = []
		const App = defineApplication({
			Model,
			update(model: Model, message: Message) {
				if (message._tag === "ChangedFilter") sent.push(message.filter)
				return update(model, message)
			},
		})
		function Sync({ search }: { readonly search: { readonly filter: string } }) {
			App.useInbound(search, ({ filter }) => Message.ChangedFilter({ filter }))
			return null
		}
		const tree = (filter: string) => (
			<App.Provider init={{ model: { filter, count: 0 } }}>
				<Sync search={{ filter }} />
			</App.Provider>
		)
		const mounted = render(tree("a"))
		mounted.rerender(tree("a"))
		mounted.rerender(tree("b"))
		expect(sent).toEqual(["b"])
	})

	// useInbound compares each value with the last one it sent, not with the initial value.
	// Comparing with a stale value drops the change back to an earlier value.
	it("sends a change back to an earlier value", function () {
		const sent: Array<string> = []
		const App = defineApplication({
			Model,
			update(model: Model, message: Message) {
				if (message._tag === "ChangedFilter") sent.push(message.filter)
				return update(model, message)
			},
		})
		function Sync({ filter }: { readonly filter: string }) {
			App.useInbound(filter, (filter) => Message.ChangedFilter({ filter }))
			return null
		}
		const tree = (filter: string) => (
			<App.Provider init={{ model: { filter, count: 0 } }}>
				<Sync filter={filter} />
			</App.Provider>
		)

		const mounted = render(tree("all"))
		mounted.rerender(tree("done"))
		mounted.rerender(tree("all"))

		expect(sent).toEqual(["done", "all"])
	})

	// useInbound sends from a layout effect, so update sees the new value before any passive
	// effect in the same commit runs, including effects in components rendered earlier.
	it("delivers the change before passive effects of the same commit", function () {
		const events: Array<string> = []
		const App = defineApplication({
			Model,
			update(model: Model, message: Message) {
				if (message._tag === "ChangedFilter") events.push("update")
				return update(model, message)
			},
		})
		function PassiveEffect() {
			React.useEffect(function recordPassiveEffect() {
				events.push("passive effect")
			})
			return null
		}
		function Sync({ filter }: { readonly filter: string }) {
			App.useInbound(filter, (filter) => Message.ChangedFilter({ filter }))
			return null
		}
		const tree = (filter: string) => (
			<App.Provider init={{ model: { filter, count: 0 } }}>
				<PassiveEffect />
				<Sync filter={filter} />
			</App.Provider>
		)
		const mounted = render(tree("all"))
		events.length = 0

		mounted.rerender(tree("done"))

		expect(events).toEqual(["update", "passive effect"])
	})
})

describe("crash", function () {
	effectIt.live("passes the Model and triggering Message to view and report, and restarts from init", () =>
		Effect.gen(function* () {
			const reports: Array<{ readonly model: Option.Option<Model>; readonly message: Option.Option<Message> }> =
				[]
			const init = vi.fn(() => ({ model: { filter: "all", count: 0 } }))
			const App = defineApplication({
				Model,
				update,
				onCrash() {},
				crash: {
					report: ({ model, message }) =>
						Effect.sync(function () {
							reports.push({ model, message })
						}),
				},
			})
			function Buttons() {
				const dispatch = App.useDispatch()
				return (
					<>
						<button onClick={() => dispatch(Message.ClickedIncrement())}>increment</button>
						<button onClick={() => dispatch(Message.ClickedExplode())}>explode</button>
						<output>{App.useModel((model) => model.count)}</output>
					</>
				)
			}
			render(
				<App.Provider
					init={init}
					crash={{
						view: ({ model, message, restart }) => (
							<button onClick={restart}>
								{`restart ${Option.getOrThrow(model).count} ${Option.getOrThrow(message)._tag}`}
							</button>
						),
					}}
				>
					<Buttons />
				</App.Provider>
			)
			expect(init).toHaveBeenCalledTimes(1)
			fireEvent.click(screen.getByText("increment"))
			act(function () {
				fireEvent.click(screen.getByText("explode"))
			})
			yield* Effect.promise(() =>
				waitFor(() => expect(screen.getByRole("button").textContent).toBe("restart 1 ClickedExplode"))
			)
			yield* Effect.promise(() => waitFor(() => expect(reports).toHaveLength(1)))
			expect(reports[0]).toEqual({
				model: Option.some({ filter: "all", count: 1 }),
				message: Option.some(Message.ClickedExplode()),
			})
			fireEvent.click(screen.getByText("restart 1 ClickedExplode"))
			expect(screen.getByRole("status").textContent).toBe("0")
			expect(init).toHaveBeenCalledTimes(2)
		})
	)

	// The application sets the default crash handling, and a Provider can replace it for its
	// subtree. A Provider callback replaces the application callback, so only one of them runs.
	effectIt.live("uses the Provider's view and report over the application's", () =>
		Effect.gen(function* () {
			const reported: Array<string> = []
			const App = defineApplication({
				Model,
				update,
				onCrash: Function.constVoid,
				crash: {
					view: () => <span>application view</span>,
					report: () => Effect.sync(() => reported.push("application report")),
				},
			})
			function Explode() {
				const dispatch = App.useDispatch()
				return <button onClick={() => dispatch(Message.ClickedExplode())}>explode</button>
			}
			render(
				<App.Provider
					init={{ model: { filter: "all", count: 0 } }}
					crash={{
						view: () => <span>provider view</span>,
						report: () => Effect.sync(() => reported.push("provider report")),
					}}
				>
					<Explode />
				</App.Provider>
			)

			act(function () {
				fireEvent.click(screen.getByText("explode"))
			})

			yield* Effect.promise(() => waitFor(() => expect(reported).toEqual(["provider report"])))
			expect(screen.getByText("provider view")).toBeDefined()
			expect(screen.queryByText("application view")).toBeNull()
		})
	)

	it("uses the default view when no view is configured", function () {
		const App = defineApplication({ Model, update, validateInit: true })
		render(
			<App.Provider init={{ model: { filter: "all", count: Number.NaN } }}>
				<span>children</span>
			</App.Provider>
		)
		expect(screen.getByRole("alert").textContent).toContain("Expected a finite number")
		expect(screen.queryByText("children")).toBeNull()
	})
})

describe("development checks", function () {
	it("skips the init check when validateInit is false", function () {
		const App = defineApplication({ Model, update, validateInit: false })
		render(
			<App.Provider init={{ model: { filter: "all", count: Number.NaN } }}>
				<span>children</span>
			</App.Provider>
		)
		expect(screen.getByText("children")).toBeDefined()
	})

	it("freezes published Models outside production", function () {
		let captured: Model | undefined
		const App = defineApplication({ Model, update })
		function Capture() {
			captured = App.useModel()
			return null
		}
		render(
			<App.Provider init={{ model: { filter: "all", count: 0 } }}>
				<Capture />
			</App.Provider>
		)
		expect(Object.isFrozen(captured)).toBe(true)
		expect(function () {
			;(captured as { count: number }).count = 1
		}).toThrow(TypeError)
	})

	it("freezes the Models that update returns", function () {
		let captured: Model | undefined
		const App = defineApplication({ Model, update })
		function Capture() {
			captured = App.useModel()
			const dispatch = App.useDispatch()
			return <button onClick={() => dispatch(Message.ClickedIncrement())}>increment</button>
		}
		render(
			<App.Provider init={{ model: { filter: "all", count: 0 } }}>
				<Capture />
			</App.Provider>
		)

		fireEvent.click(screen.getByRole("button"))

		expect(captured?.count).toBe(1)
		expect(Object.isFrozen(captured)).toBe(true)
	})

	// The Provider folds the commit-source snapshot into init before it publishes a Model, so
	// validateInit checks the result of that fold, not the init it started from.
	it.each([
		{ init: 0, snapshot: Number.NaN, renders: "the crash view" },
		{ init: Number.NaN, snapshot: 1, renders: "its children" },
	])("renders $renders for init $init and snapshot $snapshot", function ({ init, snapshot }) {
		const App = defineApplication({ Model, update, validateInit: true })
		const commitSource: CommitSource<Message> = {
			getSnapshot: () =>
				Result.succeed([{ key: "count", version: 1, message: Message.ChangedCount({ count: snapshot }) }]),
			subscribe: () => Function.constVoid,
		}

		render(
			<App.Provider
				init={{ model: { filter: "all", count: init } }}
				commitSource={commitSource}
			>
				<span>children</span>
			</App.Provider>
		)

		expect(screen.queryByRole("alert") === null).toBe(Number.isFinite(snapshot))
		expect(screen.queryByText("children") === null).toBe(!Number.isFinite(snapshot))
	})

	it("leaves Models unfrozen when freezeModel is false", function () {
		let captured: Model | undefined
		const App = defineApplication({ Model, update, freezeModel: false })
		function Capture() {
			captured = App.useModel()
			return null
		}
		render(
			<App.Provider init={{ model: { filter: "all", count: 0 } }}>
				<Capture />
			</App.Provider>
		)
		expect(Object.isFrozen(captured)).toBe(false)
	})
})

describe("snapshot identity", function () {
	// `useModel()` without a selector compares whole Models with `Object.is`. A view that keeps the
	// Model reference, such as in a memo dependency, must see each new Model even when it is
	// structurally equal to the last one.
	it("rerenders whole-Model readers when update returns an equal copy", function () {
		const seen: Array<Model> = []
		const App = defineApplication({ Model, update })
		function Capture() {
			seen.push(App.useModel())
			const dispatch = App.useDispatch()
			return <button onClick={() => dispatch(Message.ChangedCount({ count: 0 }))}>copy</button>
		}
		render(
			<App.Provider init={{ model: { filter: "all", count: 0 } }}>
				<Capture />
			</App.Provider>
		)
		const before = seen.at(-1)

		fireEvent.click(screen.getByRole("button"))

		expect(seen.at(-1)).toEqual(before)
		expect(seen.at(-1)).not.toBe(before)
	})

	// React resubscribes whenever a source's `subscribe` function changes. If `useSubmodel`
	// returned a new source on every render, each parent render would resubscribe every child.
	it("returns the same Submodel source across renders for the same lift", function () {
		const sources: Array<ModelSource<number, Message>> = []
		const App = defineApplication({ Model, update })
		const count = { read: (model: Model) => model.count, toParentMessage: Function.identity<Message> }
		function Capture() {
			sources.push(App.useSubmodel(count))
			return null
		}
		const tree = (filter: string) => (
			<App.Provider init={{ model: { filter, count: 0 } }}>
				<Capture />
			</App.Provider>
		)
		const mounted = render(tree("all"))

		mounted.rerender(tree("done"))

		expect(sources.length).toBeGreaterThan(1)
		expect(new Set(sources).size).toBe(1)
	})

	// React reads the server snapshot during hydration and warns when two reads differ, because an
	// uncached snapshot can loop forever. `useOptionalModel` wraps the Model in `Some`, so it must
	// reuse that wrapper.
	it("hydrates useOptionalModel from a cached server snapshot", function () {
		const consoleError = vi.spyOn(console, "error").mockImplementation(Function.constVoid)
		const App = defineApplication({ Model, update })
		function Read() {
			return (
				<span>
					{Option.match(App.useOptionalModel(), { onNone: () => "none", onSome: ({ count }) => count })}
				</span>
			)
		}
		const tree = (
			<App.Provider init={{ model: { filter: "all", count: 1 } }}>
				<Read />
			</App.Provider>
		)
		const container = document.createElement("div")
		container.innerHTML = renderToString(tree)
		try {
			let root: ReturnType<typeof hydrateRoot> | undefined
			act(function () {
				root = hydrateRoot(container, tree)
			})
			act(() => root?.unmount())

			expect(consoleError.mock.calls.flat().join(" ")).not.toContain("getServerSnapshot should be cached")
		} finally {
			consoleError.mockRestore()
		}
	})
})
