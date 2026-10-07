import { it } from "@effect/vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Effect, Latch, Layer, Schema, Stream } from "effect"
import React, { StrictMode } from "react"
import { hydrateRoot, type Root } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, vi } from "vitest"
import { modifyFields } from "./struct"
import type * as Command from "./command"
import { defineMessageUnion } from "./message"
import { defineApplication } from "./react"
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
	unrelated: Schema.Finite,
})
type Model = typeof Model.Type

type UpdateReturn = Update.Return<Model, Message>

const initialModel = (): Model => ({ status: "Loading", value: "", unrelated: 0 })

const update = (model: Model, message: Message): UpdateReturn =>
	Message.match<UpdateReturn>(message, {
		CompletedLoad: ({ value }) => ({ model: modifyFields(model, { status: () => "Success", value: () => value }) }),
		FailedLoad: ({ error }) => ({ model: modifyFields(model, { status: () => "Failure", value: () => error }) }),
		SetValue: ({ value }) => ({ model: modifyFields(model, { value: () => value }) }),
		BumpedUnrelated: () => ({ model: modifyFields(model, { unrelated: (unrelated) => unrelated + 1 }) }),
	})

const makeInitCommand = (effect: Effect.Effect<Message>): Command.Command<Message> => ({ name: "Load", effect })

afterEach(function () {
	vi.restoreAllMocks()
})

describe("React Provider", function () {
	it.live("renders Loading immediately and settles a successful async init Command", () =>
		Effect.gen(function* () {
			const testServices = yield* Effect.context<never>()
			const latch = Latch.makeUnsafe()
			let starts = 0
			const command = makeInitCommand(
				Effect.gen(function* () {
					starts += 1
					yield* latch.await
					return Message.CompletedLoad({ value: "loaded" })
				})
			)
			const { Provider, useModel } = defineApplication({ Model, update })

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
			yield* Effect.promise(() =>
				waitFor(function () {
					expect(starts).toBe(1)
				})
			)

			act(function () {
				Effect.runSyncWith(testServices)(latch.open)
			})
			yield* Effect.promise(() =>
				waitFor(function () {
					expect(screen.getByText("Success:loaded")).toBeDefined()
				})
			)
		})
	)

	it.live("hydrates the server snapshot before starting the init Command", () =>
		Effect.gen(function* () {
			const testServices = yield* Effect.context<never>()
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
			const { Provider, useModel } = defineApplication({ Model, update })

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
				yield* Effect.promise(() =>
					act(() =>
						Effect.runPromiseWith(testServices)(
							Effect.sync(function () {
								root = hydrateRoot(container, <App />, {
									onRecoverableError(error) {
										recoverableErrors.push(error)
									},
								})
							})
						)
					)
				)

				expect(container.textContent).toBe("Loading:")
				expect(recoverableErrors).toEqual([])
				yield* Effect.promise(() =>
					waitFor(function () {
						expect(starts).toBe(1)
					})
				)

				act(function () {
					Effect.runSyncWith(testServices)(latch.open)
				})
				yield* Effect.promise(() =>
					waitFor(function () {
						expect(container.textContent).toBe("Success:hydrated")
					})
				)
			} finally {
				yield* Effect.promise(() =>
					act(() =>
						Effect.runPromiseWith(testServices)(
							Effect.sync(function () {
								root?.unmount()
							})
						)
					)
				)
				container.remove()
			}
		})
	)

	it.live("runs an init Command once through Strict Mode's Effect replay", () =>
		Effect.gen(function* () {
			let runs = 0
			const command = makeInitCommand(
				Effect.sync(function () {
					runs += 1
					return Message.CompletedLoad({ value: "strict" })
				})
			)
			const { Provider, useModel } = defineApplication({ Model, update })

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

			yield* Effect.promise(() =>
				waitFor(function () {
					expect(screen.getByText("strict")).toBeDefined()
				})
			)
			expect(runs).toBe(1)
		})
	)

	it.live("restarts only an unfinished init Command when Activity reconnects Effects", () =>
		Effect.gen(function* () {
			const testServices = yield* Effect.context<never>()
			const latch = Latch.makeUnsafe()
			let runs = 0
			let interruptions = 0
			const command = makeInitCommand(
				Effect.gen(function* () {
					runs += 1
					yield* latch.await
					return Message.CompletedLoad({ value: "activity" })
				}).pipe(
					Effect.onInterrupt(() =>
						Effect.sync(function () {
							interruptions += 1
						})
					)
				)
			)
			const { Provider, useModel } = defineApplication({ Model, update })

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
			yield* Effect.promise(() =>
				waitFor(function () {
					expect(runs).toBe(1)
				})
			)

			rendered.rerender(<App mode="hidden" />)
			yield* Effect.promise(() =>
				waitFor(function () {
					expect(interruptions).toBe(1)
				})
			)
			rendered.rerender(<App mode="visible" />)
			yield* Effect.promise(() =>
				waitFor(function () {
					expect(runs).toBe(2)
				})
			)

			act(function () {
				Effect.runSyncWith(testServices)(latch.open)
			})
			yield* Effect.promise(() =>
				waitFor(function () {
					expect(screen.getByText("activity")).toBeDefined()
				})
			)

			rendered.rerender(<App mode="hidden" />)
			rendered.rerender(<App mode="visible" />)
			yield* Effect.callback<void>(function (resume) {
				queueMicrotask(() => resume(Effect.void))
			})
			expect(runs).toBe(2)
		})
	)

	it.live("interrupts an in-flight init Command on unmount", () =>
		Effect.gen(function* () {
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
					Effect.onInterrupt(() =>
						Effect.sync(function () {
							interruptions += 1
						})
					)
				)
			)
			const { Provider, useModel } = defineApplication({
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
			yield* Effect.promise(() =>
				waitFor(function () {
					expect(starts).toBe(1)
				})
			)
			rendered.unmount()
			yield* Effect.promise(() =>
				waitFor(function () {
					expect(interruptions).toBe(1)
				})
			)

			yield* latch.open
			yield* Effect.callback<void>(function (resume) {
				queueMicrotask(() => resume(Effect.void))
			})
			expect(results).toBe(0)
		})
	)

	it.live("keeps one live Subscription resource through Strict Mode and releases it on unmount", () =>
		Effect.gen(function* () {
			let acquires = 0
			let releases = 0
			const layer = Layer.effectDiscard(
				Effect.acquireRelease(
					Effect.sync(function () {
						acquires += 1
					}),
					() =>
						Effect.sync(function () {
							releases += 1
						})
				)
			)
			const subscriptions = Subscription.make<Model, Message>()((entry) => ({
				keepAlive: entry(
					{ status: Schema.String },
					{
						modelToDependencies: (model) => ({ status: model.status }),
						dependenciesToStream: () => Stream.never,
					}
				),
			}))
			const { Provider, useModel } = defineApplication({ Model, update, subscriptions, layer })

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

			yield* Effect.promise(() =>
				waitFor(function () {
					expect(acquires - releases).toBe(1)
				})
			)
			rendered.unmount()
			yield* Effect.promise(() =>
				waitFor(function () {
					expect(releases).toBe(acquires)
				})
			)
		})
	)

	it("uses selector equivalence to avoid unrelated rerenders", function () {
		const { Provider, useDispatch, useModel } = defineApplication({ Model, update })
		let selectedRenders = 0
		let fullRenders = 0

		function Selected() {
			selectedRenders += 1
			const selected = useModel((model) => ({ value: model.value }))
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
		const { Provider, useModel } = defineApplication({ Model, update })

		function View() {
			return <span>{useModel().value}</span>
		}

		const firstInit: UpdateReturn = { model: modifyFields(initialModel(), { value: () => "first" }) }
		const secondInit: UpdateReturn = { model: modifyFields(initialModel(), { value: () => "second" }) }
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
})
