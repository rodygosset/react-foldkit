import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Effect, Latch, Layer, Schema, Stream } from "effect"
import React, { StrictMode } from "react"
import { hydrateRoot, type Root } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import type * as Command from "./command"
import * as ReactStore from "./internal/react-store"
import { defineMessageUnion } from "./message"
import { make } from "./react"
import * as Subscription from "./subscription"
import type * as Update from "./update"

const Message = defineMessageUnion({
	CompletedLoad: { value: Schema.String },
	FailedLoad: { error: Schema.String },
	SetValue: { value: Schema.String },
	BumpedUnrelated: {},
})
type Message = typeof Message.Type

const Model = Schema.Struct({
	status: Schema.String,
	value: Schema.String,
	unrelated: Schema.Number,
})
type Model = typeof Model.Type

type UpdateReturn = Update.Return<Model, Message>

const initialModel = (): Model => ({ status: "Loading", value: "", unrelated: 0 })

const update = (model: Model, message: Message): UpdateReturn =>
	Message.match<UpdateReturn>(message, {
		CompletedLoad: ({ value }) => ({ model: { ...model, status: "Success", value } }),
		FailedLoad: ({ error }) => ({ model: { ...model, status: "Failure", value: error } }),
		SetValue: ({ value }) => ({ model: { ...model, value } }),
		BumpedUnrelated: () => ({ model: { ...model, unrelated: model.unrelated + 1 } }),
	})

const makeInitCommand = (effect: Effect.Effect<Message>): Command.Command<Message> => ({ name: "Load", effect })

afterEach(function () {
	vi.restoreAllMocks()
})

describe("React Provider", function () {
	it("renders Loading immediately and settles a successful async init Command", async function () {
		const latch = Latch.makeUnsafe()
		let starts = 0
		const command = makeInitCommand(
			Effect.gen(function* () {
				starts += 1
				yield* latch.await
				return Message.CompletedLoad({ value: "loaded" })
			})
		)
		const { Provider, useModel } = make({ Model, update })

		function View() {
			const model = useModel()
			return <span>{`${model.status}:${model.value}`}</span>
		}

		render(
			<Provider init={{ model: initialModel(), commands: [command] }}>
				<View />
			</Provider>
		)

		expect(screen.getByText("Loading:")).toBeDefined()
		await waitFor(function () {
			expect(starts).toBe(1)
		})

		act(function () {
			Effect.runSync(latch.open)
		})
		await waitFor(function () {
			expect(screen.getByText("Success:loaded")).toBeDefined()
		})
	})

	it("hydrates the server snapshot before starting the init Command", async function () {
		const latch = Latch.makeUnsafe()
		let starts = 0
		const recoverableErrors: Array<unknown> = []
		const command = makeInitCommand(
			Effect.gen(function* () {
				starts += 1
				yield* latch.await
				return Message.CompletedLoad({ value: "hydrated" })
			})
		)
		const { Provider, useModel } = make({ Model, update })

		function View() {
			const model = useModel()
			return <span>{`${model.status}:${model.value}`}</span>
		}

		function App() {
			return (
				<Provider init={{ model: initialModel(), commands: [command] }}>
					<View />
				</Provider>
			)
		}

		const serverHtml = renderToString(<App />)
		const container = document.createElement("div")
		container.innerHTML = serverHtml
		document.body.appendChild(container)
		let root: Root | undefined

		try {
			await act(async function () {
				root = hydrateRoot(container, <App />, {
					onRecoverableError: function (error) {
						recoverableErrors.push(error)
					},
				})
			})

			expect(container.textContent).toBe("Loading:")
			expect(recoverableErrors).toEqual([])
			await waitFor(function () {
				expect(starts).toBe(1)
			})

			act(function () {
				Effect.runSync(latch.open)
			})
			await waitFor(function () {
				expect(container.textContent).toBe("Success:hydrated")
			})
		} finally {
			await act(async function () {
				root?.unmount()
			})
			container.remove()
		}
	})

	it("runs an init Command once through Strict Mode's Effect replay", async function () {
		let runs = 0
		const command = makeInitCommand(
			Effect.sync(function () {
				runs += 1
				return Message.CompletedLoad({ value: "strict" })
			})
		)
		const { Provider, useModel } = make({ Model, update })

		function View() {
			return <span>{useModel().value}</span>
		}

		render(
			<StrictMode>
				<Provider init={{ model: initialModel(), commands: [command] }}>
					<View />
				</Provider>
			</StrictMode>
		)

		await waitFor(function () {
			expect(screen.getByText("strict")).toBeDefined()
		})
		expect(runs).toBe(1)
	})

	it("restarts only an unfinished init Command when Activity reconnects Effects", async function () {
		const latch = Latch.makeUnsafe()
		let runs = 0
		let interruptions = 0
		const command = makeInitCommand(
			Effect.gen(function* () {
				runs += 1
				yield* latch.await
				return Message.CompletedLoad({ value: "activity" })
			}).pipe(
				Effect.onInterrupt(function () {
					return Effect.sync(function () {
						interruptions += 1
					})
				})
			)
		)
		const { Provider, useModel } = make({ Model, update })

		function View() {
			return <span>{useModel().value}</span>
		}

		function App(props: { mode: "visible" | "hidden" }) {
			return (
				<React.Activity mode={props.mode}>
					<Provider init={{ model: initialModel(), commands: [command] }}>
						<View />
					</Provider>
				</React.Activity>
			)
		}

		const rendered = render(<App mode="visible" />)
		await waitFor(function () {
			expect(runs).toBe(1)
		})

		rendered.rerender(<App mode="hidden" />)
		await waitFor(function () {
			expect(interruptions).toBe(1)
		})
		rendered.rerender(<App mode="visible" />)
		await waitFor(function () {
			expect(runs).toBe(2)
		})

		act(function () {
			Effect.runSync(latch.open)
		})
		await waitFor(function () {
			expect(screen.getByText("activity")).toBeDefined()
		})

		rendered.rerender(<App mode="hidden" />)
		rendered.rerender(<App mode="visible" />)
		await new Promise<void>(function (resolve) {
			queueMicrotask(resolve)
		})
		expect(runs).toBe(2)
	})

	it("interrupts an in-flight init Command on unmount", async function () {
		const latch = Latch.makeUnsafe()
		let starts = 0
		let interruptions = 0
		let results = 0
		const command = makeInitCommand(
			Effect.gen(function* () {
				starts += 1
				yield* latch.await
				return Message.CompletedLoad({ value: "late" })
			}).pipe(
				Effect.onInterrupt(function () {
					return Effect.sync(function () {
						interruptions += 1
					})
				})
			)
		)
		const { Provider, useModel } = make({
			Model,
			update(model: Model, message: Message): UpdateReturn {
				results += 1
				return update(model, message)
			},
		})

		function View() {
			return <span>{useModel().status}</span>
		}

		const rendered = render(
			<Provider init={{ model: initialModel(), commands: [command] }}>
				<View />
			</Provider>
		)
		await waitFor(function () {
			expect(starts).toBe(1)
		})
		rendered.unmount()
		await waitFor(function () {
			expect(interruptions).toBe(1)
		})

		Effect.runSync(latch.open)
		await new Promise<void>(function (resolve) {
			queueMicrotask(resolve)
		})
		expect(results).toBe(0)
	})

	it("keeps one live Subscription resource through Strict Mode and releases it on unmount", async function () {
		let acquires = 0
		let releases = 0
		const layer = Layer.effectDiscard(
			Effect.acquireRelease(
				Effect.sync(function () {
					acquires += 1
				}),
				function () {
					return Effect.sync(function () {
						releases += 1
					})
				}
			)
		)
		const subscriptions = Subscription.make<Model, Message>()(function (entry) {
			return {
				keepAlive: entry(
					{ status: Schema.String },
					{
						modelToDependencies: function (model) {
							return { status: model.status }
						},
						dependenciesToStream: function () {
							return Stream.never
						},
					}
				),
			}
		})
		const { Provider, useModel } = make({ Model, update, subscriptions, layer })

		function View() {
			return <span>{useModel().status}</span>
		}

		const rendered = render(
			<StrictMode>
				<Provider init={{ model: initialModel() }}>
					<View />
				</Provider>
			</StrictMode>
		)

		await waitFor(function () {
			expect(acquires - releases).toBe(1)
		})
		rendered.unmount()
		await waitFor(function () {
			expect(releases).toBe(acquires)
		})
	})

	it("uses selector equivalence to avoid unrelated rerenders", function () {
		const { Provider, useDispatch, useModel } = make({ Model, update })
		let selectedRenders = 0
		let fullRenders = 0

		function Selected() {
			selectedRenders += 1
			const selected = useModel(function (model) {
				return { value: model.value }
			})
			return <span>{selected.value}</span>
		}

		function Full() {
			fullRenders += 1
			useModel()
			return null
		}

		function Controls() {
			const dispatch = useDispatch()
			return (
				<>
					<button onClick={() => dispatch(Message.BumpedUnrelated())}>Bump</button>
					<button onClick={() => dispatch(Message.SetValue({ value: "changed" }))}>Change</button>
				</>
			)
		}

		render(
			<Provider init={{ model: initialModel() }}>
				<Selected />
				<Full />
				<Controls />
			</Provider>
		)
		const initialSelectedRenders = selectedRenders
		const initialFullRenders = fullRenders

		fireEvent.click(screen.getByText("Bump"))
		expect(selectedRenders).toBe(initialSelectedRenders)
		expect(fullRenders).toBe(initialFullRenders + 1)

		fireEvent.click(screen.getByText("Change"))
		expect(selectedRenders).toBe(initialSelectedRenders + 1)
	})

	it("captures init for one Provider identity and replaces it on keyed remount", function () {
		const { Provider, useModel } = make({ Model, update })

		function View() {
			return <span>{useModel().value}</span>
		}

		const firstInit: UpdateReturn = { model: { ...initialModel(), value: "first" } }
		const secondInit: UpdateReturn = { model: { ...initialModel(), value: "second" } }
		const rendered = render(
			<Provider init={firstInit}>
				<View />
			</Provider>
		)
		expect(screen.getByText("first")).toBeDefined()

		rendered.rerender(
			<Provider init={secondInit}>
				<View />
			</Provider>
		)
		expect(screen.getByText("first")).toBeDefined()

		rendered.rerender(
			<Provider
				key="second"
				init={secondInit}
			>
				<View />
			</Provider>
		)
		expect(screen.getByText("second")).toBeDefined()
	})

	it("Seed writes the Model before activate so useModel sees it on first paint", function () {
		const { Provider, Seed, useModel } = make({ Model, update })
		const seeded = { ...initialModel(), status: "Success", value: "preloaded" }

		function View() {
			return <span>{`${useModel().status}:${useModel().value}`}</span>
		}

		render(
			<Provider init={{ model: initialModel() }}>
				<Seed model={seeded}>
					<View />
				</Seed>
			</Provider>
		)

		expect(screen.getByText("Success:preloaded")).toBeDefined()
	})

	it("Seed with an equivalent Model does not overwrite on rerender", function () {
		const { Provider, Seed, useModel } = make({ Model, update })
		const first = { ...initialModel(), status: "Success", value: "first" }

		function View() {
			return <span>{useModel().value}</span>
		}

		function App(props: { readonly model: Model }) {
			return (
				<Provider init={{ model: initialModel() }}>
					<Seed model={props.model}>
						<View />
					</Seed>
				</Provider>
			)
		}

		const rendered = render(<App model={first} />)
		expect(screen.getByText("first")).toBeDefined()
		rendered.rerender(<App model={{ ...first }} />)
		expect(screen.getByText("first")).toBeDefined()
	})

	it("seed throws after the store is active", function () {
		const store = ReactStore.make({ update }, { model: initialModel() })
		const deactivate = store.activate()
		try {
			expect(function () {
				store.seed({ ...initialModel(), value: "late" })
			}).toThrow(/Seed.*active/)
		} finally {
			deactivate()
		}
	})
})
