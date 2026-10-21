import { it } from "@effect/vitest"
import { Deferred, Effect, Schema } from "effect"
import { overlay } from "@foldkit/devtools/vite"
import { defineMessageUnion } from "foldkit/message"
import React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect } from "vitest"
import * as Application from "../../src/application"
import { __configure } from "../../src/devtoolsOverlay"

let root: Root | undefined
let container: HTMLDivElement | undefined
let disposeOverlay: (() => void) | undefined

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
	disposeOverlay?.()
	root = undefined
	container = undefined
	disposeOverlay = undefined
	document.querySelector("[data-react-foldkit-devtools='provider-selector']")?.remove()
})

// The overlay renders into an open shadow root on Foldkit's DevTools host element.
const panelRoot = (): ShadowRoot | null | undefined => document.getElementById("foldkit-devtools")?.shadowRoot

const waitFor = (predicate: () => boolean): Promise<void> => expect.poll(predicate, { timeout: 5_000 }).toBe(true)

describe("native Foldkit DevTools overlay", function () {
	it.live(
		"records live updates, previews history, blocks historical dispatch, resumes latest, and selects Providers",
		() =>
			Effect.gen(function* () {
				const release = yield* Deferred.make<void>()
				const Message = defineMessageUnion({ Increment: {}, CommandDone: {} })
				const Model = Schema.Struct({ count: Schema.Finite, done: Schema.Boolean })
				const command = {
					name: "WaitForCompletion",
					effect: Deferred.await(release).pipe(Effect.as(Message.CommandDone())),
				}
				const App = Application.define(
					{
						Model,
						Message,
						update: (model, message) =>
							message._tag === "Increment"
								? { model: { ...model, count: model.count + 1 }, commands: [command] }
								: { model: { ...model, done: true } },
					},
					{ devTools: { show: "Always", mode: "TimeTravel", Message, banner: "native overlay" } }
				)
				const Other = Application.define(
					{
						Model: Schema.Finite,
						Message: Schema.Finite,
						update: (_model: number, message: number) => ({ model: message }),
					},
					{ devTools: { show: "Always", mode: "TimeTravel" } }
				)
				function Counter() {
					const model = App.useModel()
					const dispatch = App.useDispatch()
					return (
						<button onClick={() => dispatch(Message.Increment())}>{`${model.count}:${model.done}`}</button>
					)
				}
				function OtherCounter() {
					const model = Other.useModel()
					const dispatch = Other.useDispatch()
					return <button onClick={() => dispatch(model + 1)}>{`other:${model}`}</button>
				}

				disposeOverlay = __configure(overlay, undefined)
				const view = mount(
					<>
						<App.Provider init={{ model: { count: 0, done: false } }}>
							<Counter />
						</App.Provider>
						<Other.Provider init={{ model: 0 }}>
							<OtherCounter />
						</Other.Provider>
					</>
				)
				yield* Effect.promise(() => waitFor(() => Boolean(panelRoot()?.querySelector(".dt-badge"))))
				yield* Effect.promise(() =>
					waitFor(() => Boolean(document.querySelector("[data-react-foldkit-devtools='provider-selector']")))
				)
				const selector = document.querySelector<HTMLSelectElement>(
					"[data-react-foldkit-devtools='provider-selector']"
				)
				expect(selector?.options).toHaveLength(2)
				function selectCounter() {
					if (selector === null) throw new Error("Provider selector missing")
					selector.value = "0"
					selector.dispatchEvent(new Event("change", { bubbles: true }))
				}
				selectCounter()
				yield* Effect.promise(() => waitFor(() => Boolean(panelRoot()?.querySelector(".dt-badge"))))
				panelRoot()?.querySelector<HTMLButtonElement>(".dt-badge")?.click()
				yield* Effect.promise(() =>
					waitFor(
						() => panelRoot()?.querySelector(".dt-panel")?.textContent?.includes("native overlay") === true
					)
				)
				view.querySelector<HTMLButtonElement>("button")?.click()
				view.querySelector<HTMLButtonElement>("button")?.click()
				yield* Effect.promise(() => waitFor(() => view.textContent?.includes("2:false") === true))
				yield* Effect.promise(() => waitFor(() => (panelRoot()?.querySelectorAll(".dt-row").length ?? 0) >= 2))
				const incrementRows = Array.from(panelRoot()?.querySelectorAll<HTMLElement>(".dt-row") ?? []).filter(
					(row) => row.textContent?.includes("Increment")
				)
				expect(incrementRows.length).toBe(2)
				// History lists the newest entry first, so the last row is the first Increment.
				incrementRows.at(-1)?.click()
				yield* Effect.promise(() =>
					waitFor(() => panelRoot()?.querySelector(".dt-panel")?.textContent?.includes("Paused") === true)
				)
				yield* Effect.promise(() => waitFor(() => view.textContent?.includes("1:false") === true))

				view.querySelector<HTMLButtonElement>("button")?.click()
				yield* Effect.sleep("20 millis")
				expect(view.textContent).toContain("1:false")
				yield* Deferred.succeed(release, undefined)
				yield* Effect.promise(() =>
					waitFor(
						() => panelRoot()?.querySelector(".dt-panel")?.textContent?.includes("CommandDone") === true
					)
				)
				expect(view.textContent).toContain("1:false")
				const resume = Array.from(panelRoot()?.querySelectorAll<HTMLButtonElement>("button") ?? []).find(
					(button) => button.textContent?.includes("Resume")
				)
				expect(resume).toBeDefined()
				resume?.click()
				yield* Effect.promise(() => waitFor(() => view.textContent?.includes("2:true") === true))

				selector?.dispatchEvent(new Event("change", { bubbles: true }))
				if (selector !== null) selector.value = "1"
				selector?.dispatchEvent(new Event("change", { bubbles: true }))
				yield* Effect.promise(() =>
					waitFor(() => panelRoot()?.querySelector(".dt-panel")?.textContent?.includes("Live") === true)
				)
				expect(panelRoot()?.querySelector(".dt-panel")?.textContent).not.toContain("native overlay")
				yield* Effect.promise(() => waitFor(() => (panelRoot()?.querySelectorAll(".dt-row").length ?? 0) === 1))
			})
	)
})
