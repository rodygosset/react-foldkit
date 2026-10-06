import { act, cleanup, render, waitFor } from "@testing-library/react"
import { Cause, Deferred, Effect, Layer, Option, Result, Schema } from "effect"
import React from "react"
import { hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, expect, it, vi } from "vitest"
import { entry, fakeSource, Message } from "../test/fixtures/commit-source"
import { createSourceFixture } from "../test/fixtures/react-commit-source"
import { defineApplication, defineSubmodel } from "./react"
import { CommitSourceError } from "./commitSource"
import * as ReactStore from "./internal/react-store"

afterEach(function () {
	cleanup()
	vi.restoreAllMocks()
})

function CauseView(props: { cause: Cause.Cause<unknown>; seen: Array<Cause.Cause<unknown>> }) {
	props.seen.push(props.cause)
	return <pre role="alert">{Cause.pretty(props.cause)}</pre>
}

it("owns a factory result across rerenders and releases its subscription", function () {
	const f = createSourceFixture([], fakeSource([entry("a", 1)]))
	const create = vi.fn(() => Result.succeed(f.source.source))
	const tree = () => (
		<f.App.Provider
			init={f.init}
			createCommitSource={create}
		>
			<f.View />
		</f.App.Provider>
	)
	const mounted = render(tree())
	mounted.rerender(tree())
	expect(create).toHaveBeenCalledTimes(1)
	expect(f.handled).toEqual([Message.Received({ value: "a" })])
	expect(f.source.listeners).toBe(1)
	mounted.unmount()
	expect(f.source.listeners).toBe(0)
})

it("renders typed factory failures during SSR and reports them after mounting", function () {
	const f = createSourceFixture([])
	const error = new Error("registry failed")
	const onError = vi.fn(() => Effect.void)
	const tree = (
		<f.App.Provider
			init={f.init}
			createCommitSource={() => Result.fail(error)}
			onError={onError}
			renderError={(cause) => <span role="alert">{Cause.pretty(cause)}</span>}
		>
			<f.View />
		</f.App.Provider>
	)
	expect(renderToString(tree)).toContain("registry failed")
	expect(onError).not.toHaveBeenCalled()
	expect(render(tree).getByRole("alert").textContent).toContain("registry failed")
	expect(onError).toHaveBeenCalledWith(Cause.fail(error))
	expect(f.source.subscriptions).toBe(0)
	expect(f.handled).toEqual([])
})

it("captures factory, snapshot and bootstrap update defects", function () {
	const f = createSourceFixture([])
	const defect = new Error("bootstrap defect")
	const factories = [
		function () {
			throw defect
		},
		() =>
			Result.succeed({
				...f.source.source,
				getSnapshot() {
					throw defect
				},
			}),
	]
	for (const create of factories) {
		const onError = vi.fn(() => Effect.void)
		const mounted = render(
			<f.App.Provider
				init={f.init}
				createCommitSource={create}
				onError={onError}
			>
				<f.View />
			</f.App.Provider>
		)
		// A defect is a programmer error, so the default fallback stays generic and the
		// observable detail travels through onError.
		expect(mounted.getByRole("alert").textContent).toBe("The application could not start.")
		expect(onError).toHaveBeenCalledWith(Cause.die(defect))
		mounted.unmount()
	}
	const App = defineApplication({
		Model: Schema.Number,
		update(_model: number, _message: Message) {
			throw defect
		},
	})
	const source = fakeSource([entry("a", 1)])
	const onError = vi.fn(() => Effect.void)
	render(
		<App.Provider
			init={{ model: 0 }}
			createCommitSource={() => Result.succeed(source.source)}
			onError={onError}
		>
			child
		</App.Provider>
	)
	expect(onError).toHaveBeenCalledWith(Cause.die(defect))
	expect(source.subscriptions).toBe(0)
})

it("reports a typed live snapshot failure, then accepts the next publication", function () {
	const f = createSourceFixture([])
	const failure = new Error("snapshot failure")
	let fail = false
	const source = {
		...f.source.source,
		getSnapshot: () => (fail ? Result.fail(failure) : f.source.source.getSnapshot()),
	}
	const onError = vi.fn(() => Effect.void)
	const mounted = render(
		<f.App.Provider
			init={f.init}
			commitSource={source}
			onError={onError}
		>
			<f.View />
		</f.App.Provider>
	)
	fail = true
	act(() => f.source.notify())
	expect(onError).toHaveBeenCalledExactlyOnceWith(Cause.fail(failure))
	expect(f.handled).toEqual([])
	fail = false
	act(() => f.source.publish([entry("a", 1)]))
	expect(f.handled).toEqual([Message.Received({ value: "a" })])
	mounted.unmount()
})

it("reports a throwing live snapshot as a defect and accepts the next publication", function () {
	const f = createSourceFixture([])
	const defect = new Error("catch-up read failed")
	let fail = false
	const source = {
		...f.source.source,
		getSnapshot() {
			if (fail) throw defect
			return f.source.source.getSnapshot()
		},
	}
	const onError = vi.fn(() => Effect.void)
	const mounted = render(
		<f.App.Provider
			init={f.init}
			commitSource={source}
			onError={onError}
		>
			<f.View />
		</f.App.Provider>
	)
	fail = true
	act(() => f.source.notify())
	expect(onError).toHaveBeenCalledExactlyOnceWith(Cause.die(defect))
	expect(mounted.getByRole("alert").textContent).toBe("The application could not start.")
	fail = false
	act(() => f.source.publish([entry("a", 1)]))
	expect(f.handled).toEqual([Message.Received({ value: "a" })])
	mounted.unmount()
})

it("preserves setup failure and cleanup defect in the Provider's reported Cause", function () {
	const source = fakeSource<Message>()
	const f = createSourceFixture([], source)
	const defect = new Error("cleanup defect")
	source.onSubscribe(() => source.publish([entry("a", 1), entry("a", 2)]))
	source.onUnsubscribe(function () {
		throw defect
	})
	const onError = vi.fn<(cause: Cause.Cause<unknown>) => Effect.Effect<void>>(() => Effect.void)
	const mounted = render(
		<f.App.Provider
			init={f.init}
			createCommitSource={() => Result.succeed(source.source)}
			onError={onError}
		>
			<f.View />
		</f.App.Provider>
	)
	expect(mounted.getByRole("alert").textContent).toContain("Duplicate source key: a")
	expect(onError).toHaveBeenCalledTimes(1)
	const cause = onError.mock.calls[0]![0]
	expect(Result.getOrThrow(Cause.findError(cause))).toEqual(
		new CommitSourceError({ reason: "DuplicateKey", key: "a" })
	)
	expect(Result.getOrThrow(Cause.findDefect(cause))).toBe(defect)
	expect(source.listeners).toBe(0)
	expect(source.unsubscriptions).toBe(1)
})

it("renders live failures, then recovers on a valid notification without replay", function () {
	const f = createSourceFixture([])
	const onError = vi.fn(() => Effect.void)
	const mounted = render(
		<f.App.Provider
			init={f.init}
			createCommitSource={() => Result.succeed(f.source.source)}
			onError={onError}
		>
			<f.View />
		</f.App.Provider>
	)
	act(() => f.source.publish([entry("a", 1)]))
	act(() => f.source.publish([entry("b", 1), entry("b", 2)]))
	expect(mounted.getByRole("alert").textContent).toContain("Duplicate source key: b")
	expect(onError).toHaveBeenCalledTimes(1)
	expect(f.source.listeners).toBe(1)
	act(() => f.source.publish([entry("a", 1), entry("b", 1)]))
	expect(mounted.queryByRole("alert")).toBeNull()
	expect(f.model.values).toEqual(["a", "b"])
	expect(f.handled).toHaveLength(2)
})

it("reports cleanup defects without throwing from unmount", function () {
	const f = createSourceFixture([])
	const defect = new Error("unmount defect")
	f.source.onUnsubscribe(function () {
		throw defect
	})
	const onError = vi.fn(() => Effect.void)
	const mounted = render(
		<f.App.Provider
			init={f.init}
			commitSource={f.source.source}
			onError={onError}
		>
			<f.View />
		</f.App.Provider>
	)
	expect(() => mounted.unmount()).not.toThrow()
	expect(onError).toHaveBeenCalledWith(Cause.die(defect))
	expect(f.source.listeners).toBe(0)
})

it("preserves a failing error observer's defect in the fallback", function () {
	const f = createSourceFixture([])
	const error = new Error("factory failure")
	const mounted = render(
		<f.App.Provider
			init={f.init}
			createCommitSource={() => Result.fail(error)}
			onError={function () {
				throw new Error("observer defect")
			}}
		>
			<f.View />
		</f.App.Provider>
	)
	expect(mounted.getByRole("alert").textContent).toContain("factory failure")
})

it("gives renderError the whole Cause, including a failing observer's defect", function () {
	const f = createSourceFixture([])
	const error = new Error("factory failure")
	const seen: Array<Cause.Cause<unknown>> = []
	const mounted = render(
		<f.App.Provider
			init={f.init}
			createCommitSource={() => Result.fail(error)}
			onError={() => Effect.die(new Error("observer defect"))}
			renderError={(cause) => (
				<CauseView
					cause={cause}
					seen={seen}
				/>
			)}
		>
			<f.View />
		</f.App.Provider>
	)
	expect(mounted.getByRole("alert").textContent).toContain("factory failure")
	expect(mounted.getByRole("alert").textContent).toContain("observer defect")
	const cause = seen.at(-1)!
	expect(Result.getOrThrow(Cause.findError(cause))).toBe(error)
	expect(String(Result.getOrThrow(Cause.findDefect(cause)))).toContain("observer defect")
})

it("optional root and child hooks return absence and subscribe when provided", function () {
	const App = defineApplication({
		Model: Schema.Number,
		update: (model: number, _message: Message) => ({ model: model + 1 }),
	})
	const Child = defineSubmodel<number, Message>()
	const values: Array<Option.Option<number>> = []
	let commit: Option.Option<ReturnType<typeof App.useCommit>> = Option.none()
	function View() {
		values.push(App.useOptionalModel())
		commit = App.useOptionalCommit()
		expect(Option.isSome(App.useOptionalDispatch())).toBe(Option.isSome(commit))
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
	act(() => Option.getOrThrow(commit)(Message.Edited()))
	expect(values.at(-1)).toEqual(Option.some(2))
	mounted.rerender(<View />)
	expect(values.at(-1)).toEqual(Option.none())
})

it("preserves typed snapshot failures before any bootstrap delivery", function () {
	const f = createSourceFixture([])
	const error = new Error("snapshot failure")
	const onError = vi.fn(() => Effect.void)
	render(
		<f.App.Provider
			init={f.init}
			createCommitSource={() => Result.succeed({ ...f.source.source, getSnapshot: () => Result.fail(error) })}
			onError={onError}
		>
			<f.View />
		</f.App.Provider>
	)
	expect(onError).toHaveBeenCalledWith(Cause.fail(error))
	expect(f.source.subscriptions).toBe(0)
	expect(f.handled).toEqual([])
})

it.each(["setup", "cleanup"])(
	"recovers a %s failure after Activity reconnects without a notification",
	function (kind) {
		const source = fakeSource<Message>()
		const f = createSourceFixture([], source)
		const onError = vi.fn(() => Effect.void)
		if (kind === "setup")
			source.onSubscribe((count) => (count === 1 ? source.publish([entry("a", 1), entry("a", 2)]) : undefined))
		else
			source.onUnsubscribe(function (count) {
				if (count === 1) throw new Error("cleanup failed")
			})
		const tree = (visible: boolean) => (
			<React.Activity mode={visible ? "visible" : "hidden"}>
				<f.App.Provider
					init={f.init}
					commitSource={source.source}
					onError={onError}
				>
					<f.View />
				</f.App.Provider>
			</React.Activity>
		)
		const mounted = render(tree(true))
		mounted.rerender(tree(false))
		source.set([entry("a", 1)])
		mounted.rerender(tree(true))
		expect(mounted.queryByRole("alert")).toBeNull()
		expect(f.model.values).toEqual(["a"])
		expect(f.handled).toHaveLength(1)
		expect(onError).toHaveBeenCalledTimes(1)
		expect(source.listeners).toBe(1)
	}
)

it("retains tokens for committed Messages when rejecting a reentrant notification", function () {
	const source = fakeSource<Message>()
	const App = defineApplication({
		Model: Schema.Number,
		update(model: number, _message: Message) {
			source.notify()
			return { model: model + 1 }
		},
	})
	function View() {
		return <span data-testid="model">{App.useModel()}</span>
	}
	const onError = vi.fn(() => Effect.void)
	const mounted = render(
		<App.Provider
			init={{ model: 0 }}
			commitSource={source.source}
			onError={onError}
		>
			<View />
		</App.Provider>
	)
	act(() => source.publish([entry("a", 1)]))
	expect(onError).toHaveBeenCalledWith(Cause.fail(new CommitSourceError({ reason: "Reentrant" })))
	act(() => source.notify())
	expect(mounted.getByTestId("model").textContent).toBe("1")
})

it("hydrates optional root and child hooks with stable server snapshots", async function () {
	const App = defineApplication({
		Model: Schema.Number,
		update: (model: number, _message: Message) => ({ model: model + 1 }),
	})
	const Child = defineSubmodel<number, Message>()
	const projection = { read: (model: number) => model, toParentMessage: (message: Message) => message }
	let commit: Option.Option<ReturnType<typeof App.useCommit>> = Option.none()
	function Read() {
		commit = App.useOptionalCommit()
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
			<Child.Provider source={App.useSubmodel(projection)}>
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
		await act(async function () {
			root = hydrateRoot(container, tree, { onRecoverableError })
		})
		expect(container.textContent).toBe("1/1")
		act(() => Option.getOrThrow(commit)(Message.Edited()))
		expect(container.textContent).toBe("2/2")
		expect(onRecoverableError).not.toHaveBeenCalled()
	} finally {
		act(() => root?.unmount())
	}
})

it("records a bootstrap failure before awaiting an observer and combines its typed failure", async function () {
	const f = createSourceFixture([])
	const failure = new Error("bootstrap failure")
	const observerFailure = new Error("async observer failure")
	const gate = Deferred.makeUnsafe<void>()
	const onError = vi.fn(() => Deferred.await(gate).pipe(Effect.andThen(Effect.fail(observerFailure))))
	const seen: Array<Cause.Cause<unknown>> = []
	const mounted = render(
		<f.App.Provider
			init={f.init}
			createCommitSource={() => Result.fail(failure)}
			onError={onError}
			renderError={(cause) => (
				<CauseView
					cause={cause}
					seen={seen}
				/>
			)}
		>
			<f.View />
		</f.App.Provider>
	)
	expect(mounted.getByRole("alert").textContent).toContain("bootstrap failure")
	expect(mounted.getByRole("alert").textContent).not.toContain("async observer failure")
	expect(onError).toHaveBeenCalledExactlyOnceWith(Cause.fail(failure))
	await act(async function () {
		Deferred.doneUnsafe(gate, Effect.void)
	})
	await waitFor(() => expect(seen.at(-1)).toEqual(Cause.combine(Cause.fail(failure), Cause.fail(observerFailure))))
})

it("interrupts a suspended live observer when the Provider unmounts", async function () {
	const f = createSourceFixture([])
	let interrupted = false
	const onError = vi.fn(() =>
		Effect.never.pipe(
			Effect.onInterrupt(() =>
				Effect.sync(function () {
					interrupted = true
				})
			)
		)
	)
	const mounted = render(
		<f.App.Provider
			init={f.init}
			commitSource={f.source.source}
			onError={onError}
		>
			<f.View />
		</f.App.Provider>
	)
	act(() => f.source.publish([entry("a", 1), entry("a", 2)]))
	expect(mounted.getByRole("alert").textContent).toContain("Duplicate source key: a")
	expect(onError).toHaveBeenCalledTimes(1)
	mounted.unmount()
	await waitFor(() => expect(interrupted).toBe(true))
	expect(f.source.listeners).toBe(0)
})

it("interrupts a suspended bootstrap observer when the Provider unmounts", async function () {
	const f = createSourceFixture([])
	let interrupted = false
	const mounted = render(
		<f.App.Provider
			init={f.init}
			createCommitSource={() => Result.fail(new Error("bootstrap failure"))}
			onError={() =>
				Effect.never.pipe(
					Effect.onInterrupt(() =>
						Effect.sync(function () {
							interrupted = true
						})
					)
				)
			}
		>
			<f.View />
		</f.App.Provider>
	)
	mounted.unmount()
	await waitFor(() => expect(interrupted).toBe(true))
})

it("keeps a newer success after an older asynchronous observer fails", async function () {
	const f = createSourceFixture([])
	const gate = Deferred.makeUnsafe<void>()
	let completed = false
	const observerDefect = new Error("old observer defect")
	const mounted = render(
		<f.App.Provider
			init={f.init}
			commitSource={f.source.source}
			onError={() =>
				Deferred.await(gate).pipe(
					Effect.andThen(Effect.die(observerDefect)),
					Effect.onExit(() =>
						Effect.sync(function () {
							completed = true
						})
					)
				)
			}
		>
			<f.View />
		</f.App.Provider>
	)
	act(() => f.source.publish([entry("a", 1), entry("a", 2)]))
	expect(mounted.getByRole("alert").textContent).toContain("Duplicate source key: a")
	act(() => f.source.publish([entry("a", 1)]))
	expect(mounted.queryByRole("alert")).toBeNull()
	await act(async function () {
		Deferred.doneUnsafe(gate, Effect.void)
	})
	await waitFor(() => expect(completed).toBe(true))
	expect(mounted.queryByRole("alert")).toBeNull()
	expect(f.model.values).toEqual(["a"])
})

it("keeps the latest failure when an older asynchronous observer finishes", async function () {
	const f = createSourceFixture([])
	const gate = Deferred.makeUnsafe<void>()
	const firstDefect = new Error("first observer defect")
	const secondDefect = new Error("second observer defect")
	let completed = false
	const onError = vi
		.fn()
		.mockImplementationOnce(() =>
			Deferred.await(gate).pipe(
				Effect.andThen(Effect.die(firstDefect)),
				Effect.onExit(() =>
					Effect.sync(function () {
						completed = true
					})
				)
			)
		)
		.mockImplementation(() => Effect.die(secondDefect))
	const mounted = render(
		<f.App.Provider
			init={f.init}
			commitSource={f.source.source}
			onError={onError}
			renderError={(cause) => <pre role="alert">{Cause.pretty(cause)}</pre>}
		>
			<f.View />
		</f.App.Provider>
	)
	act(() => f.source.publish([entry("a", 1), entry("a", 2)]))
	act(() => f.source.publish([entry("b", 1), entry("b", 2)]))
	expect(mounted.getByRole("alert").textContent).toContain("Duplicate source key: b")
	expect(mounted.getByRole("alert").textContent).toContain("second observer defect")
	await act(async function () {
		Deferred.doneUnsafe(gate, Effect.void)
	})
	await waitFor(() => expect(completed).toBe(true))
	expect(mounted.getByRole("alert").textContent).toContain("Duplicate source key: b")
	expect(mounted.getByRole("alert").textContent).not.toContain("first observer defect")
})

it("combines setup failure with asynchronous cleanup before observing it", async function () {
	const source = fakeSource<Message>()
	const gate = Deferred.makeUnsafe<void>()
	const defect = new Error("asynchronous setup cleanup")
	const make = ReactStore.make
	const makeSpy = vi.spyOn(ReactStore, "make").mockImplementationOnce(function (config, init) {
		const store = make(config, init)
		return {
			...store,
			activate: store.activate.pipe(
				Effect.tap(() =>
					Effect.addFinalizer(() => Deferred.await(gate).pipe(Effect.andThen(Effect.die(defect))))
				)
			),
		}
	})
	const App = defineApplication({
		Model: Schema.Number,
		update: (model: number, _message: Message) => ({ model }),
	})
	source.onSubscribe(() => source.publish([entry("a", 1), entry("a", 2)]))
	const onError = vi.fn(() => Effect.void)
	const seen: Array<Cause.Cause<unknown>> = []
	const mounted = render(
		<App.Provider
			init={{ model: 0 }}
			commitSource={source.source}
			onError={onError}
			renderError={(cause) => (
				<CauseView
					cause={cause}
					seen={seen}
				/>
			)}
		>
			child
		</App.Provider>
	)
	makeSpy.mockRestore()
	expect(mounted.getByRole("alert").textContent).toContain("Duplicate source key: a")
	expect(onError).not.toHaveBeenCalled()
	expect(source.listeners).toBe(0)
	await act(async function () {
		Deferred.doneUnsafe(gate, Effect.void)
	})
	await waitFor(() => expect(onError).toHaveBeenCalledTimes(1))
	const combined = Cause.combine(
		Cause.fail(new CommitSourceError({ reason: "DuplicateKey", key: "a" })),
		Cause.die(defect)
	)
	expect(onError).toHaveBeenCalledWith(combined)
	expect(seen.at(-1)).toEqual(combined)
})

it("awaits asynchronous resource cleanup and its observer after closing the store scope", async function () {
	const cleanupGate = Deferred.makeUnsafe<void>()
	const observerGate = Deferred.makeUnsafe<void>()
	const defect = new Error("asynchronous unmount cleanup")
	let observed = false
	let completed = false
	let acquired = false
	const App = defineApplication({
		Model: Schema.Number,
		update: (model: number, _message: Message) => ({ model }),
		layer: Layer.effectDiscard(
			Effect.acquireRelease(
				Effect.sync(function () {
					acquired = true
				}),
				() => Deferred.await(cleanupGate).pipe(Effect.andThen(Effect.die(defect)))
			)
		),
	})
	const mounted = render(
		<App.Provider
			init={{ model: 0, commands: [{ name: "Acquire", effect: Effect.never }] }}
			onError={function (cause) {
				expect(cause).toEqual(Cause.die(defect))
				observed = true
				return Deferred.await(observerGate).pipe(
					Effect.andThen(
						Effect.sync(function () {
							completed = true
						})
					)
				)
			}}
		>
			child
		</App.Provider>
	)
	await waitFor(() => expect(acquired).toBe(true))
	expect(() => mounted.unmount()).not.toThrow()
	expect(observed).toBe(false)
	Deferred.doneUnsafe(cleanupGate, Effect.void)
	await waitFor(() => expect(observed).toBe(true))
	expect(completed).toBe(false)
	Deferred.doneUnsafe(observerGate, Effect.void)
	await waitFor(() => expect(completed).toBe(true))
})

it("reports subscription defects and cancels their asynchronous observer on unmount", async function () {
	const f = createSourceFixture([])
	const defect = new Error("subscription defect")
	let interrupted = false
	const onError = vi.fn(() =>
		Effect.never.pipe(
			Effect.onInterrupt(() =>
				Effect.sync(function () {
					interrupted = true
				})
			)
		)
	)
	const mounted = render(
		<f.App.Provider
			init={f.init}
			commitSource={{
				...f.source.source,
				subscribe() {
					throw defect
				},
			}}
			onError={onError}
		>
			<f.View />
		</f.App.Provider>
	)
	expect(mounted.getByRole("alert").textContent).toBe("The application could not start.")
	expect(onError).toHaveBeenCalledExactlyOnceWith(Cause.die(defect))
	mounted.unmount()
	await waitFor(() => expect(interrupted).toBe(true))
})

it("keeps a successful reconnect after an older cleanup observer fails", async function () {
	const source = fakeSource<Message>()
	const cleanupGate = Deferred.makeUnsafe<void>()
	const observerGate = Deferred.makeUnsafe<void>()
	const cleanupDefect = new Error("old cleanup defect")
	const observerDefect = new Error("old cleanup observer defect")
	let acquired = 0
	let released = 0
	let completed = false
	const App = defineApplication({
		Model: Schema.Number,
		update: (model: number, _message: Message) => ({ model }),
		layer: Layer.effectDiscard(
			Effect.acquireRelease(
				Effect.sync(function () {
					acquired += 1
				}),
				() =>
					Effect.suspend(() =>
						++released === 1
							? Deferred.await(cleanupGate).pipe(Effect.andThen(Effect.die(cleanupDefect)))
							: Effect.void
					)
			)
		),
	})
	const onError = vi.fn(() =>
		Deferred.await(observerGate).pipe(
			Effect.andThen(Effect.die(observerDefect)),
			Effect.onExit(() =>
				Effect.sync(function () {
					completed = true
				})
			)
		)
	)
	const tree = (visible: boolean) => (
		<React.Activity mode={visible ? "visible" : "hidden"}>
			<App.Provider
				init={{ model: 0, commands: [{ name: "Acquire", effect: Effect.never }] }}
				commitSource={source.source}
				onError={onError}
			>
				<span>ready</span>
			</App.Provider>
		</React.Activity>
	)
	const mounted = render(tree(true))
	await waitFor(() => expect(acquired).toBe(1))
	mounted.rerender(tree(false))
	mounted.rerender(tree(true))
	await act(async function () {
		Deferred.doneUnsafe(cleanupGate, Effect.void)
	})
	await waitFor(() => expect(acquired).toBe(2))
	await waitFor(() => expect(onError).toHaveBeenCalledExactlyOnceWith(Cause.die(cleanupDefect)))
	expect(mounted.queryByRole("alert")).toBeNull()
	expect(source.listeners).toBe(1)
	await act(async function () {
		Deferred.doneUnsafe(observerGate, Effect.void)
	})
	await waitFor(() => expect(completed).toBe(true))
	expect(mounted.queryByRole("alert")).toBeNull()
	expect(mounted.getByText("ready")).toBeTruthy()
})

it("reports an asynchronous cleanup defect when unmount interrupts pending setup", async function () {
	const f = createSourceFixture([])
	const cleanupGate = Deferred.makeUnsafe<void>()
	const observerGate = Deferred.makeUnsafe<void>()
	const defect = new Error("pending setup cleanup defect")
	let acquired = false
	let completed = false
	const make = ReactStore.make
	const makeSpy = vi.spyOn(ReactStore, "make").mockImplementationOnce(function (config, init) {
		const store = make(config, init)
		return {
			...store,
			activate: store.activate.pipe(
				Effect.tap(() =>
					Effect.addFinalizer(() => Deferred.await(cleanupGate).pipe(Effect.andThen(Effect.die(defect))))
				),
				Effect.tap(() =>
					Effect.sync(function () {
						acquired = true
					})
				),
				Effect.andThen(Effect.never)
			),
		}
	})
	const onError = vi.fn((_cause: Cause.Cause<unknown>) =>
		Deferred.await(observerGate).pipe(
			Effect.andThen(
				Effect.sync(function () {
					completed = true
				})
			)
		)
	)
	const mounted = render(
		<f.App.Provider
			init={f.init}
			commitSource={f.source.source}
			onError={onError}
		>
			<f.View />
		</f.App.Provider>
	)
	makeSpy.mockRestore()
	expect(acquired).toBe(true)
	expect(f.source.listeners).toBe(0)
	expect(() => mounted.unmount()).not.toThrow()
	expect(onError).not.toHaveBeenCalled()
	Deferred.doneUnsafe(cleanupGate, Effect.void)
	await waitFor(() => expect(onError).toHaveBeenCalledTimes(1))
	expect(Result.getOrThrow(Cause.findDefect(onError.mock.calls[0]![0]))).toBe(defect)
	expect(completed).toBe(false)
	Deferred.doneUnsafe(observerGate, Effect.void)
	await waitFor(() => expect(completed).toBe(true))
})

it("disconnects the source while a canceled observer awaits its finalizer", async function () {
	const f = createSourceFixture([])
	const gate = Deferred.makeUnsafe<void>()
	let completed = false
	const mounted = render(
		<f.App.Provider
			init={f.init}
			commitSource={f.source.source}
			onError={() =>
				Effect.never.pipe(
					Effect.onInterrupt(() =>
						Deferred.await(gate).pipe(
							Effect.andThen(
								Effect.sync(function () {
									completed = true
								})
							)
						)
					)
				)
			}
		>
			<f.View />
		</f.App.Provider>
	)
	act(() => f.source.publish([entry("a", 1), entry("a", 2)]))
	mounted.unmount()
	expect(completed).toBe(false)
	expect(f.source.listeners).toBe(0)
	f.source.publish([entry("b", 1)])
	expect(f.handled).toEqual([])
	Deferred.doneUnsafe(gate, Effect.void)
	await waitFor(() => expect(completed).toBe(true))
})
