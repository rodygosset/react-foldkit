import { it } from "@effect/vitest"
import { act, cleanup, render, waitFor } from "@testing-library/react"
import { Effect, Schema } from "effect"
import React from "react"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, vi } from "vitest"
import { entry, fakeSource, Message } from "../test/fixtures/commitSource"
import { createSourceFixture } from "../test/fixtures/reactCommitSource"
import { defineApplication, type CommitEntry, type CommitSource } from "./react"
import type * as Command from "./command"
import type * as Update from "./update"
afterEach(function () {
	cleanup()
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
})

describe("Provider commitSource", function () {
	const providerFixture = (initial: ReadonlyArray<CommitEntry<Message>> = [], source = fakeSource(initial)) =>
		createSourceFixture(initial, source)

	it("bootstraps in snapshot order and delivers subsequent values without replay or lost edits", function () {
		const f = providerFixture([entry("b", 1), entry("a", 1)])
		const mounted = render(<f.Tree />)
		expect(f.renders[0]!.values).toEqual(["b", "a"])
		act(() => f.dispatch(Message.Edited()))
		act(() => f.source.publish([entry("b", 1), entry("a", 2, "new")]))
		mounted.rerender(<f.Tree />)
		act(() => f.source.notify())
		expect(f.model.values).toEqual(["b", "a", "new"])
		expect(f.model.edits).toBe(1)
		expect(f.handled).toHaveLength(4)
		expect(f.source.subscriptions).toBe(1)
	})

	it("catches an immediate change during connection setup", function () {
		const source = fakeSource([entry("a", 1)])
		source.onSubscribe(() => source.publish([entry("a", 2, "new")]))
		const f = providerFixture([], source)
		render(<f.Tree />)
		expect(f.renders[0]!.values).toEqual(["a"])
		expect(f.model.values).toEqual(["a", "new"])
		expect(f.handled).toHaveLength(2)
	})

	it("rejects duplicate bootstrap keys before invoking update", function () {
		vi.spyOn(console, "error").mockImplementation(function () {})
		const f = providerFixture([entry("a", 1), entry("a", 2)])
		expect(render(<f.Tree />).getByRole("alert").textContent).toContain("Duplicate source key: a")
		expect(f.handled).toEqual([])
		expect(f.source.subscriptions).toBe(0)
	})

	it.each(["replace", "remove", "add"])("retains its owned source after %s on a mounted Provider", function (change) {
		vi.spyOn(console, "error").mockImplementation(function () {})
		const f = providerFixture()
		const replacement = fakeSource<Message>()
		const tree = (source: CommitSource<Message> | undefined) => (
			<f.App.Provider
				init={f.init}
				commitSource={source}
			>
				<f.View />
			</f.App.Provider>
		)
		const mounted = render(tree(change === "add" ? undefined : f.source.source))
		mounted.rerender(
			tree(change === "replace" ? replacement.source : change === "add" ? f.source.source : undefined)
		)
		expect(f.source.listeners).toBe(change === "add" ? 0 : 1)
		expect(replacement.subscriptions).toBe(0)
	})

	it("retains successful tokens through Strict Mode reconnection", function () {
		const source = fakeSource<Message>()
		source.onSubscribe(function (count) {
			if (count === 1) source.publish([entry("a", 1)])
		})
		source.onUnsubscribe(function (count) {
			if (count === 1) source.set([entry("a", 1), entry("b", 1)])
		})
		const f = providerFixture([], source)
		render(
			<React.StrictMode>
				<f.Tree />
			</React.StrictMode>
		)
		expect(f.model.values).toEqual(["a", "b"])
		expect(f.handled).toHaveLength(2)
		expect(source.listeners).toBe(1)
		act(() => source.notify())
		expect(f.handled).toHaveLength(2)
	})

	it("catches up after Activity reconnects and cleans up stale callbacks on unmount", function () {
		const f = providerFixture([entry("a", 1)])
		const mounted = render(<f.Tree />)
		act(() => f.source.publish([entry("a", 2, "new")]))
		act(() => f.dispatch(Message.Edited()))
		mounted.rerender(<f.Tree visible={false} />)
		expect(f.source.listeners).toBe(0)
		act(() => f.source.publish([entry("a", 3, "latest")]))
		mounted.rerender(<f.Tree />)
		expect(f.model.values).toEqual(["a", "new", "latest"])
		expect(f.model.edits).toBe(1)
		const handled = f.handled.length
		const stale = f.source.notifications.at(-1)!
		mounted.unmount()
		f.source.publish([entry("a", 4)])
		stale()
		expect(f.handled).toHaveLength(handled)
		expect(f.source.listeners).toBe(0)
		expect(f.source.unsubscriptions).toBe(f.source.subscriptions)
	})

	it.live("preserves base init and bootstrap Commands, deferring both until client activation", () =>
		Effect.gen(function* () {
			const Model = Schema.Struct({ value: Schema.String, completions: Schema.Finite })
			type Model = typeof Model.Type
			const runs: string[] = []
			const command = (name: string): Command.Command<Message> => ({
				name,
				effect: Effect.sync(function () {
					runs.push(name)
					return Message.Edited()
				}),
			})
			const App = defineApplication({
				Model,
				update: (model: Model, message: Message): Update.Return<Model, Message> =>
					Message.match(message, {
						Received: ({ value }) => ({
							model: { ...model, value: model.value + value },
							commands: [command(value)],
						}),
						Edited: () => ({ model: { ...model, completions: model.completions + 1 } }),
					}),
			})
			const source = fakeSource([entry("a", 1), entry("b", 1)])
			function View() {
				const model = App.useModel()
				return <span>{`${model.value}:${model.completions}`}</span>
			}
			const tree = (
				<App.Provider
					init={{ model: { value: "base:", completions: 0 }, commands: [command("init")] }}
					commitSource={source.source}
				>
					<View />
				</App.Provider>
			)
			expect(renderToString(tree)).toBe("<span>base:ab:0</span>")
			expect(runs).toEqual([])
			expect(source.subscriptions).toBe(0)
			const mounted = render(tree)
			yield* Effect.promise(() => waitFor(() => expect(mounted.container.textContent).toBe("base:ab:3")))
			expect(runs).toEqual(["init", "a", "b"])
			act(() => source.notify())
			expect(runs).toEqual(["init", "a", "b"])
		})
	)
})
const fixture = (initial: ReadonlyArray<CommitEntry<Message>> = [], source = fakeSource(initial)) =>
	createSourceFixture(initial, source)

describe("generic commit source contract", function () {
	it("renders the bootstrap Model and does not replay the initial snapshot", function () {
		const f = fixture([entry("search", "load-1", "initial")])
		render(<f.Tree />)
		expect(f.renders[0]!.values).toEqual(["initial"])
		act(() => f.source.notify())
		expect(f.model.values).toEqual(["initial"])
		expect(f.handled).toHaveLength(1)
		expect(f.source.listeners).toBe(1)
	})
	it("delivers added entries synchronously in snapshot order and retains unrelated edits", function () {
		const f = fixture()
		render(<f.Tree />)
		act(() => f.dispatch(Message.Edited()))
		let valuesBeforePublishReturns: ReadonlyArray<string> = []
		act(function () {
			f.source.publish([entry("b", 1), entry("a", "one")])
			valuesBeforePublishReturns = f.handled
				.filter((message) => message._tag === "Received")
				.map((message) => message.value)
		})
		expect(valuesBeforePublishReturns).toEqual(["b", "a"])
		expect(f.model.values).toEqual(["b", "a"])
		expect(f.model.edits).toBe(1)
	})
	it("subscribes before rereading, covering a silent change during subscription setup", function () {
		const initial = [entry("a", 1)]
		const source = fakeSource(initial)
		source.onSubscribe(() => source.set([entry("a", 2, "during-subscribe")]))
		const f = fixture(initial, source)
		render(<f.Tree />)
		expect(f.model.values).toEqual(["a", "during-subscribe"])
	})
	it("handles an immediate subscription notification without duplicate catch-up delivery", function () {
		const source = fakeSource<Message>()
		source.onSubscribe(() => source.publish([entry("a", 1)]))
		const f = fixture([], source)
		render(<f.Tree />)
		expect(f.model.values).toEqual(["a"])
		expect(f.handled).toHaveLength(1)
	})
	it("retains the first bootstrap baseline and connection across rerenders", function () {
		const f = fixture([entry("a", 1)])
		const mounted = render(<f.Tree />)
		act(() => f.source.publish([entry("a", 2, "new")]))
		mounted.rerender(<f.Tree />)
		act(() => f.source.notify())
		expect(f.model.values).toEqual(["a", "new"])
		expect(f.source.subscriptions).toBe(1)
	})
	it("releases the subscription when immediate notification fails validation", function () {
		vi.spyOn(console, "error").mockImplementation(function () {})
		const source = fakeSource<Message>()
		source.onSubscribe(() => source.publish([entry("a", 1), entry("a", 2)]))
		const f = fixture([], source)
		expect(render(<f.Tree />).getByRole("alert").textContent).toContain("Duplicate source key: a")
		expect(source.subscriptions).toBe(1)
		expect(source.unsubscriptions).toBe(1)
		expect(source.listeners).toBe(0)
		expect(f.handled).toEqual([])
	})
	it("Strict Mode retains successful tokens and catches changes during its cleanup/setup gap", function () {
		const source = fakeSource([entry("a", 1)])
		const retained = entry("stable", 1, "retained")
		source.set([retained, entry("a", 2, "before-activation")])
		source.onUnsubscribe(function (count) {
			if (count === 1) source.set([retained, entry("a", 3, "gap")])
		})
		const f = fixture([], source)
		render(
			<React.StrictMode>
				<f.Tree />
			</React.StrictMode>
		)
		expect(f.model.values).toEqual(["retained", "before-activation", "gap"])
		expect(f.handled).toHaveLength(5)
		expect(source.subscriptions).toBe(2)
		expect(source.unsubscriptions).toBe(1)
		expect(source.listeners).toBe(1)
		act(() => source.notify())
		expect(f.handled).toHaveLength(5)
	})
	it("catches the latest value after Activity reconnects without resetting bookkeeping", function () {
		const f = fixture([entry("a", 1)])
		const mounted = render(<f.Tree />)
		const retained = entry("stable", 1, "retained")
		act(() => f.source.publish([retained, entry("a", 2, "before-hide")]))
		expect(f.model.values).toEqual(["a", "retained", "before-hide"])
		mounted.rerender(<f.Tree visible={false} />)
		expect(f.source.listeners).toBe(0)
		act(() => f.source.publish([retained, entry("a", 3, "intermediate")]))
		act(() => f.source.publish([retained, entry("a", 4, "latest")]))
		expect(f.model.values).toEqual(["a", "retained", "before-hide"])
		mounted.rerender(<f.Tree visible />)
		expect(f.model.values).toEqual(["a", "retained", "before-hide", "latest"])
		act(() => f.source.notify())
		expect(f.handled).toHaveLength(4)
		expect(f.source.listeners).toBe(1)
	})
	it("unsubscribes on unmount and ignores an already captured stale notification", function () {
		const f = fixture()
		const mounted = render(<f.Tree />)
		const stale = f.source.notifications[0]!
		mounted.unmount()
		expect(f.source.listeners).toBe(0)
		expect(f.source.unsubscriptions).toBe(f.source.subscriptions)
		f.source.publish([entry("a", 1)])
		stale()
		expect(f.handled).toEqual([])
	})
	it("does not subscribe or replay Messages during server rendering", function () {
		const f = fixture([entry("a", "transported")])
		expect(renderToString(<f.Tree />)).toContain("a")
		expect(f.renders[0]!.values).toEqual(["a"])
		expect(f.source.subscriptions).toBe(0)
		expect(f.handled).toHaveLength(1)
	})
})
