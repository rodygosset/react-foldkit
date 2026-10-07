import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { Cause, Effect, Option, Result, Schema } from "effect"
import React from "react"
import { hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, expect, it, vi } from "vitest"
import { entry, fakeSource, Message } from "../test/fixtures/commit-source"
import { createSourceFixture } from "../test/fixtures/react-commit-source"
import { defineApplication, defineSubmodel } from "./react"
import { CommitSourceError } from "./commitSource"

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

it("replaces mounted children with the fallback after an update defect and keeps the crash terminal", async function () {
	const defect = new Error("update defect")
	const source = fakeSource<Message>()
	const onCrash = vi.fn()
	const App = defineApplication({
		Model: Schema.Number,
		update(model: number, message: Message) {
			if (message._tag === "Edited") throw defect
			return { model: model + 1 }
		},
		onCrash,
	})
	const seen: Array<Cause.Cause<unknown>> = []
	const onError = vi.fn(() => Effect.void)
	function View() {
		const dispatch = App.useDispatch()
		return <button onClick={() => dispatch(Message.Edited())}>Cause update defect</button>
	}
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
			<View />
		</App.Provider>
	)
	fireEvent.click(mounted.getByRole("button", { name: "Cause update defect" }))
	await waitFor(function () {
		expect(onCrash).toHaveBeenCalledExactlyOnceWith(Cause.die(defect), Option.some(Message.Edited()))
		expect(mounted.getByRole("alert").textContent).toContain("update defect")
		expect(mounted.queryByRole("button")).toBeNull()
		expect(onError).toHaveBeenCalledExactlyOnceWith(Cause.die(defect))
		expect(seen).toEqual([Cause.die(defect)])
	})
	source.publish([entry("a", 1)])
	await waitFor(function () {
		expect(onCrash).toHaveBeenCalledExactlyOnceWith(Cause.die(defect), Option.some(Message.Edited()))
		expect(mounted.getByRole("alert").textContent).toContain("update defect")
		expect(onError).toHaveBeenCalledExactlyOnceWith(Cause.die(defect))
		expect(seen).toEqual([Cause.die(defect)])
	})
	mounted.unmount()
})

it("replaces mounted children with the fallback after a Command defect", async function () {
	const defect = new Error("command defect")
	const onCrash = vi.fn<(cause: Cause.Cause<unknown>, message: Option.Option<Message>) => void>()
	const App = defineApplication({
		Model: Schema.Number,
		update: (model: number, message: Message) =>
			message._tag === "Edited" ? { model, commands: [{ name: "Fail", effect: Effect.die(defect) }] } : { model },
		onCrash,
	})
	const seen: Array<Cause.Cause<unknown>> = []
	const onError = vi.fn((_cause: Cause.Cause<unknown>) => Effect.void)
	function View() {
		const dispatch = App.useDispatch()
		return <button onClick={() => dispatch(Message.Edited())}>Run failing command</button>
	}
	const mounted = render(
		<App.Provider
			init={{ model: 0 }}
			onError={onError}
			renderError={(cause) => (
				<CauseView
					cause={cause}
					seen={seen}
				/>
			)}
		>
			<View />
		</App.Provider>
	)
	fireEvent.click(mounted.getByRole("button", { name: "Run failing command" }))
	await waitFor(function () {
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
	mounted.unmount()
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

it("gives renderError the application Cause when its observer fails", function () {
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
	expect(mounted.getByRole("alert").textContent).not.toContain("observer defect")
	const cause = seen.at(-1)!
	expect(Result.getOrThrow(Cause.findError(cause))).toBe(error)
	expect(Result.isFailure(Cause.findDefect(cause))).toBe(true)
})

it("uses the latest error observer and fallback after rerendering", function () {
	const f = createSourceFixture([])
	const firstObserver = vi.fn(() => Effect.void)
	const latestObserver = vi.fn(() => Effect.void)
	const tree = (onError: typeof firstObserver, label: string) => (
		<f.App.Provider
			init={f.init}
			commitSource={f.source.source}
			onError={onError}
			renderError={(cause) => (
				<pre role="alert">
					{label}: {Cause.pretty(cause)}
				</pre>
			)}
		>
			<f.View />
		</f.App.Provider>
	)
	const mounted = render(tree(firstObserver, "first"))
	act(() => f.source.publish([entry("a", 1), entry("a", 2)]))
	expect(firstObserver).toHaveBeenCalledExactlyOnceWith(
		Cause.fail(new CommitSourceError({ reason: "DuplicateKey", key: "a" }))
	)
	mounted.rerender(tree(latestObserver, "latest"))
	expect(mounted.getByRole("alert").textContent).toContain("latest: ")
	act(() => f.source.publish([entry("b", 1), entry("b", 2)]))
	expect(latestObserver).toHaveBeenCalledExactlyOnceWith(
		Cause.fail(new CommitSourceError({ reason: "DuplicateKey", key: "b" }))
	)
	expect(firstObserver).toHaveBeenCalledTimes(1)
	expect(mounted.getByRole("alert").textContent).toContain("Duplicate source key: b")
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
	async function (kind) {
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
		await waitFor(function () {
			expect(mounted.queryByRole("alert")).toBeNull()
			expect(f.model.values).toEqual(["a"])
			expect(f.handled).toHaveLength(1)
			expect(onError).toHaveBeenCalledTimes(1)
			expect(source.listeners).toBe(1)
		})
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
