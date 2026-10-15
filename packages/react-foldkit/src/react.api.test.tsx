import { it as effectIt } from "@effect/vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Effect, Option, Schema } from "effect"
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { defineMessageUnion } from "foldkit/message"
import { defineApplication } from "./react"
import { modifyFields } from "foldkit/struct"
import type * as Update from "foldkit/update"

afterEach(cleanup)

const Model = Schema.Struct({ filter: Schema.String, count: Schema.Finite })
type Model = typeof Model.Type

const Message = defineMessageUnion({
	ChangedFilter: { filter: Schema.String },
	ClickedIncrement: {},
	ClickedExplode: {},
})
type Message = typeof Message.Type

const update = (model: Model, message: Message) =>
	Message.match<Update.Return<Model, Message>>(message, {
		ChangedFilter: ({ filter }) => ({ model: modifyFields(model, { filter: () => filter }) }),
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
