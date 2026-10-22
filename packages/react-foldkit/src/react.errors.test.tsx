import { it } from "@effect/vitest"
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { Cause, Effect, Layer, Option, Result, Schema, Stream } from "effect"
import { defineMessageUnion } from "foldkit/message"
import * as Subscription from "foldkit/subscription"
import React from "react"
import { hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, expect, vi } from "vitest"
import * as Application from "./application"
import { define } from "./submodel"

const Message = defineMessageUnion({ Edited: {} })
type Message = typeof Message.Type

afterEach(function () {
	cleanup()
	vi.restoreAllMocks()
})

function CauseView(props: { cause: Cause.Cause<unknown>; seen: Array<Cause.Cause<unknown>> }) {
	props.seen.push(props.cause)
	return <pre role="alert">{Cause.pretty(props.cause)}</pre>
}

function crashingApplication(defect: Error) {
	const App = Application.define({
		Model: Schema.Finite,
		Message,
		update(_model: number, _message: Message): { readonly model: number } {
			throw defect
		},
	})
	function View() {
		const dispatch = App.useDispatch()
		return <button onClick={() => dispatch(Message.Edited())}>Crash</button>
	}
	return { App, View }
}

const releaseFailingLayer = (release: () => Effect.Effect<void>) =>
	Layer.effectDiscard(Effect.acquireRelease(Effect.void, release))

it.live("replaces mounted children with the fallback after an update defect and reports the crash once", () =>
	Effect.gen(function* () {
		const defect = new Error("update defect")
		const onCrash = vi.fn()
		const App = Application.define(
			{
				Model: Schema.Finite,
				Message,
				update(model: number, message: Message) {
					if (message._tag === "Edited") throw defect
					return { model: model + 1 }
				},
			},
			{
				onCrash,
			}
		)
		const seen: Array<Cause.Cause<unknown>> = []
		const onError = vi.fn((_cause: Cause.Cause<unknown>) => Effect.void)
		function View() {
			const dispatch = App.useDispatch()
			return <button onClick={() => dispatch(Message.Edited())}>Cause update defect</button>
		}
		const mounted = render(
			<App.Provider
				init={{ model: 0 }}
				crash={{
					view: ({ cause }) => (
						<CauseView
							cause={cause}
							seen={seen}
						/>
					),
					report: ({ cause }) => onError(cause),
				}}
			>
				<View />
			</App.Provider>
		)
		fireEvent.click(mounted.getByRole("button", { name: "Cause update defect" }))
		yield* Effect.promise(() =>
			waitFor(function () {
				expect(onCrash).toHaveBeenCalledExactlyOnceWith(Cause.die(defect), Option.some(Message.Edited()))
				expect(mounted.getByRole("alert").textContent).toContain("update defect")
				expect(mounted.queryByRole("button")).toBeNull()
				expect(onError).toHaveBeenCalledExactlyOnceWith(Cause.die(defect))
				expect(seen).toEqual([Cause.die(defect)])
			})
		)
		expect(mounted.queryByRole("button")).toBeNull()
		mounted.unmount()
	})
)

it.live("replaces mounted children with the fallback after a Command defect", () =>
	Effect.gen(function* () {
		const defect = new Error("command defect")
		const onCrash = vi.fn<(cause: Cause.Cause<unknown>, message: Option.Option<Message>) => void>()
		const App = Application.define(
			{
				Model: Schema.Finite,
				Message,
				update: (model: number, message: Message) =>
					message._tag === "Edited"
						? { model, commands: [{ name: "Fail", effect: Effect.die(defect) }] }
						: { model },
			},
			{
				onCrash,
			}
		)
		const seen: Array<Cause.Cause<unknown>> = []
		const onError = vi.fn((_cause: Cause.Cause<unknown>) => Effect.void)
		function View() {
			const dispatch = App.useDispatch()
			return <button onClick={() => dispatch(Message.Edited())}>Run failing command</button>
		}
		const mounted = render(
			<App.Provider
				init={{ model: 0 }}
				crash={{
					view: ({ cause }) => (
						<CauseView
							cause={cause}
							seen={seen}
						/>
					),
					report: ({ cause }) => onError(cause),
				}}
			>
				<View />
			</App.Provider>
		)
		fireEvent.click(mounted.getByRole("button", { name: "Run failing command" }))
		yield* Effect.promise(() =>
			waitFor(function () {
				expect(onCrash).toHaveBeenCalledTimes(1)
				const [crashCause, message] = onCrash.mock.calls[0]!
				expect(Result.getOrThrow(Cause.findDefect(crashCause))).toBe(defect)
				expect(message).toEqual(Option.some(Message.Edited()))
				expect(onError).toHaveBeenCalledTimes(1)
				expect(Result.getOrThrow(Cause.findDefect(onError.mock.calls[0]![0]))).toBe(defect)
				expect(mounted.getByRole("alert").textContent).toContain("command defect")
				expect(mounted.queryByRole("button")).toBeNull()
				expect(seen).toHaveLength(1)
				expect(Result.getOrThrow(Cause.findDefect(seen[0]!))).toBe(defect)
			})
		)
		mounted.unmount()
	})
)

it.live("reports cleanup defects without throwing from unmount", () =>
	Effect.gen(function* () {
		const defect = new Error("unmount defect")
		const App = Application.define(
			{
				Model: Schema.Finite,
				Message,
				update: (model: number, _message: Message) => ({ model: model + 1 }),
			},
			{
				resources: releaseFailingLayer(() => Effect.die(defect)),
			}
		)
		function View() {
			return <span data-testid="model">{App.useModel()}</span>
		}
		const onError = vi.fn((_cause: Cause.Cause<unknown>) => Effect.void)
		const mounted = render(
			<App.Provider
				init={{ model: 0, commands: [{ name: "Acquire", effect: Effect.succeed(Message.Edited()) }] }}
				crash={{ report: ({ cause }) => onError(cause) }}
			>
				<View />
			</App.Provider>
		)
		yield* Effect.promise(() => waitFor(() => expect(mounted.getByTestId("model").textContent).toBe("1")))
		expect(() => mounted.unmount()).not.toThrow()
		yield* Effect.promise(() => waitFor(() => expect(onError).toHaveBeenCalledWith(Cause.die(defect))))
	})
)

it("keeps the fallback when the error observer throws", function () {
	const f = crashingApplication(new Error("update defect"))
	const mounted = render(
		<f.App.Provider
			init={{ model: 0 }}
			crash={{
				report() {
					throw new Error("observer defect")
				},
			}}
		>
			<f.View />
		</f.App.Provider>
	)
	fireEvent.click(mounted.getByRole("button", { name: "Crash" }))
	expect(mounted.getByRole("alert").textContent).toBe("The application could not start.")
})

it("gives the crash view the application Cause when its observer fails", function () {
	const defect = new Error("update defect")
	const f = crashingApplication(defect)
	const seen: Array<Cause.Cause<unknown>> = []
	const mounted = render(
		<f.App.Provider
			init={{ model: 0 }}
			crash={{
				view: ({ cause }) => (
					<CauseView
						cause={cause}
						seen={seen}
					/>
				),
				report: () => Effect.die(new Error("observer defect")),
			}}
		>
			<f.View />
		</f.App.Provider>
	)
	fireEvent.click(mounted.getByRole("button", { name: "Crash" }))
	expect(mounted.getByRole("alert").textContent).toContain("update defect")
	expect(mounted.getByRole("alert").textContent).not.toContain("observer defect")
	expect(seen.at(-1)).toEqual(Cause.die(defect))
})

it("uses the latest error observer and fallback after rerendering", function () {
	const defect = new Error("update defect")
	const f = crashingApplication(defect)
	const firstObserver = vi.fn((_cause: Cause.Cause<unknown>) => Effect.void)
	const latestObserver = vi.fn((_cause: Cause.Cause<unknown>) => Effect.void)
	const tree = (onError: typeof firstObserver, label: string) => (
		<f.App.Provider
			init={{ model: 0 }}
			crash={{
				view: ({ cause }) => (
					<pre role="alert">
						{label}: {Cause.pretty(cause)}
					</pre>
				),
				report: ({ cause }) => onError(cause),
			}}
		>
			<f.View />
		</f.App.Provider>
	)
	const mounted = render(tree(firstObserver, "first"))
	mounted.rerender(tree(latestObserver, "latest"))
	fireEvent.click(mounted.getByRole("button", { name: "Crash" }))
	expect(latestObserver).toHaveBeenCalledExactlyOnceWith(Cause.die(defect))
	expect(firstObserver).not.toHaveBeenCalled()
	expect(mounted.getByRole("alert").textContent).toContain("latest: ")
	mounted.rerender(tree(firstObserver, "first"))
	expect(mounted.getByRole("alert").textContent).toContain("first: ")
})

it("optional root and child hooks return absence and subscribe when provided", function () {
	const App = Application.define({
		Model: Schema.Finite,
		Message,
		update: (model: number, _message: Message) => ({ model: model + 1 }),
	})
	const Child = define({ Model: Schema.Finite, Message })
	const values: Array<Option.Option<number>> = []
	let dispatch: Option.Option<(message: Message) => void> = Option.none()
	function View() {
		values.push(App.useOptionalModel())
		dispatch = App.useOptionalDispatch()
		expect(Child.useOptionalModel()).toEqual(Option.none())
		expect(Child.useOptionalDispatch()).toEqual(Option.none())
		return null
	}
	const mounted = render(<View />)
	expect(values.at(-1)).toEqual(Option.none())
	mounted.rerender(
		<App.Provider init={{ model: 1 }}>
			<View />
		</App.Provider>
	)
	expect(values.at(-1)).toEqual(Option.some(1))
	act(() => Option.getOrThrow(dispatch)(Message.Edited()))
	expect(values.at(-1)).toEqual(Option.some(2))
	mounted.rerender(<View />)
	expect(values.at(-1)).toEqual(Option.none())
})

it.live("recovers a cleanup failure after Activity reconnects", () =>
	Effect.gen(function* () {
		let releases = 0
		const App = Application.define(
			{
				Model: Schema.Finite,
				Message,
				update: (model: number, _message: Message) => ({ model: model + 1 }),
			},
			{
				resources: releaseFailingLayer(() =>
					Effect.suspend(() => (++releases === 1 ? Effect.die(new Error("cleanup failed")) : Effect.void))
				),
			}
		)
		function View() {
			return <span data-testid="model">{App.useModel()}</span>
		}
		const onError = vi.fn((_cause: Cause.Cause<unknown>) => Effect.void)
		const init = { model: 0, commands: [{ name: "Acquire", effect: Effect.succeed(Message.Edited()) }] }
		const tree = (visible: boolean) => (
			<React.Activity mode={visible ? "visible" : "hidden"}>
				<App.Provider
					init={init}
					crash={{ report: ({ cause }) => onError(cause) }}
				>
					<View />
				</App.Provider>
			</React.Activity>
		)
		const mounted = render(tree(true))
		yield* Effect.promise(() => waitFor(() => expect(mounted.getByTestId("model").textContent).toBe("1")))
		mounted.rerender(tree(false))
		yield* Effect.promise(() => waitFor(() => expect(onError).toHaveBeenCalledTimes(1)))
		mounted.rerender(tree(true))
		yield* Effect.promise(() =>
			waitFor(function () {
				expect(mounted.queryByRole("alert")).toBeNull()
				expect(mounted.getByTestId("model").textContent).toBe("1")
				expect(onError).toHaveBeenCalledTimes(1)
			})
		)
	})
)

it.live("hydrates optional root and child hooks with stable server snapshots", () =>
	Effect.gen(function* () {
		const testServices = yield* Effect.context<never>()
		const App = Application.define({
			Model: Schema.Finite,
			Message,
			update: (model: number, _message: Message) => ({ model: model + 1 }),
		})
		const Child = define({ Model: Schema.Finite, Message })
		const child = { read: (model: number) => model, toParentMessage: (message: Message) => message }
		let dispatch: Option.Option<(message: Message) => void> = Option.none()
		function Read() {
			dispatch = App.useOptionalDispatch()
			const root = Option.getOrElse(App.useOptionalModel(), () => -1)
			const child = Option.getOrElse(Child.useOptionalModel(), () => -1)
			return (
				<span>
					{root}/{child}
				</span>
			)
		}
		function Content() {
			return (
				<Child.Provider source={App.useSubmodel(child)}>
					<Read />
				</Child.Provider>
			)
		}
		expect(renderToString(<Read />)).toContain("-1<!-- -->/<!-- -->-1")
		const tree = (
			<App.Provider init={{ model: 1 }}>
				<Content />
			</App.Provider>
		)
		const container = document.createElement("div")
		container.innerHTML = renderToString(tree)
		const onRecoverableError = vi.fn()
		let root: ReturnType<typeof hydrateRoot> | undefined
		try {
			yield* Effect.promise(() =>
				act(() =>
					Effect.runPromiseWith(testServices)(
						Effect.sync(function () {
							root = hydrateRoot(container, tree, { onRecoverableError })
						})
					)
				)
			)
			expect(container.textContent).toBe("1/1")
			act(() => Option.getOrThrow(dispatch)(Message.Edited()))
			expect(container.textContent).toBe("2/2")
			expect(onRecoverableError).not.toHaveBeenCalled()
		} finally {
			act(() => root?.unmount())
		}
	})
)

it.live("reports subscription defects and cancels their asynchronous observer on unmount", () =>
	Effect.gen(function* () {
		const defect = new Error("subscription defect")
		let interrupted = false
		const App = Application.define({
			Model: Schema.Finite,
			Message,
			update: (model: number, _message: Message) => ({ model }),
			subscriptions: Subscription.make<number, Message>()((entry) => ({
				failing: entry({}, { modelToDependencies: () => ({}), dependenciesToStream: () => Stream.die(defect) }),
			})),
		})
		const onError = vi.fn((_cause: Cause.Cause<unknown>) =>
			Effect.never.pipe(
				Effect.onInterrupt(() =>
					Effect.sync(function () {
						interrupted = true
					})
				)
			)
		)
		const mounted = render(
			<App.Provider
				init={{ model: 0 }}
				crash={{ report: ({ cause }) => onError(cause) }}
			>
				child
			</App.Provider>
		)
		yield* Effect.promise(() =>
			waitFor(function () {
				expect(mounted.getByRole("alert").textContent).toBe("The application could not start.")
				expect(onError).toHaveBeenCalledTimes(1)
			})
		)
		expect(Result.getOrThrow(Cause.findDefect(onError.mock.calls[0]![0]))).toBe(defect)
		mounted.unmount()
		yield* Effect.promise(() => waitFor(() => expect(interrupted).toBe(true)))
	})
)
