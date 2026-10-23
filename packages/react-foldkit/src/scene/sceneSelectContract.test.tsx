import { cleanup, fireEvent, render } from "@testing-library/react"
import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import React from "react"
import { afterEach, describe, expect, it } from "vitest"
import * as Application from "../application"
import * as Scene from "../scene"
import { bindSceneView } from "./sceneBinding"

const Message = defineMessageUnion({ SetText: { text: Schema.String } })
const update = (_model: string, message: typeof Message.Type) => ({ model: message.text })
const App = Application.define({ Model: Schema.String, Message, update })
afterEach(cleanup)

type Action =
	| { readonly click: string }
	| { readonly change: string }
	| { readonly value: string; readonly selected?: ReadonlyArray<string> }

describe.each(["React DOM", "Scene"] as const)("%s dynamic select contract", function (surface) {
	function check(View: React.ComponentType, actions: ReadonlyArray<Action>): void {
		if (surface === "Scene") {
			const steps: Array<Scene.SceneStep<string, typeof Message.Type, never>> = [Scene.given("")]
			for (const action of actions) {
				if ("click" in action)
					steps.push(Scene.click(Scene.role("button", { name: action.click })), Scene.expectIgnored())
				else if ("change" in action)
					steps.push(Scene.change(Scene.testId("choice"), action.change), Scene.expectIgnored())
				else {
					steps.push(Scene.expect(Scene.testId("choice")).toHaveValue(action.value))
					for (const name of action.selected ?? [])
						steps.push(Scene.expect(Scene.role("option", { name, selected: true })).toExist())
				}
			}
			Scene.scene({ update, view: bindSceneView(App, View) }, ...steps)
			return
		}
		const dom = render(<View />)
		for (const action of actions) {
			if ("click" in action) fireEvent.click(dom.getByRole("button", { name: action.click }))
			else if ("change" in action)
				fireEvent.change(dom.getByTestId("choice"), { target: { value: action.change } })
			else {
				expect((dom.getByTestId("choice") as HTMLSelectElement).value).toBe(action.value)
				for (const name of action.selected ?? [])
					expect((dom.getByRole("option", { name }) as HTMLOptionElement).selected).toBe(true)
			}
		}
	}

	it("selects the first enabled option when an empty select is populated", function () {
		function View() {
			const [ready, setReady] = React.useState(false)
			return (
				<main>
					<button onClick={() => setReady(true)}>Populate</button>
					<select data-testid="choice">
						{ready && (
							<>
								<option
									disabled
									value="a"
								>
									Alpha
								</option>
								<optgroup
									label="Unavailable"
									disabled
								>
									<option value="b">Beta</option>
								</optgroup>
								<option value="c">Gamma</option>
							</>
						)}
					</select>
				</main>
			)
		}
		check(View, [{ value: "" }, { click: "Populate" }, { value: "c", selected: ["Gamma"] }])
	})

	it("falls back when the selected option is removed", function () {
		function View() {
			const [removed, setRemoved] = React.useState(false)
			return (
				<main>
					<button onClick={() => setRemoved(true)}>Remove</button>
					<select
						data-testid="choice"
						defaultValue="b"
					>
						<option value="a">Alpha</option>
						{!removed && <option value="b">Beta</option>}
					</select>
				</main>
			)
		}
		check(View, [{ value: "b" }, { click: "Remove" }, { value: "a", selected: ["Alpha"] }])
	})

	it("preserves selected identity through insertion, reorder, and value changes", function () {
		function View() {
			const [stage, setStage] = React.useState(0)
			const options = stage === 0 ? ["a", "b"] : stage === 1 ? ["copy", "a", "b"] : ["b", "copy", "a"]
			return (
				<main>
					<button onClick={() => setStage((value) => value + 1)}>Next</button>
					<select
						data-testid="choice"
						defaultValue="b"
					>
						{options.map((id) => (
							<option
								key={id}
								value={id === "copy" ? "b" : id === "b" && stage === 2 ? "c" : id}
							>
								{id}
							</option>
						))}
					</select>
				</main>
			)
		}
		check(View, [
			{ value: "b", selected: ["b"] },
			{ click: "Next" },
			{ value: "b", selected: ["b"] },
			{ click: "Next" },
			{ value: "c", selected: ["b"] },
		])
	})

	it("preserves an explicit empty selection until the options change", function () {
		function View() {
			const [revision, setRevision] = React.useState(0)
			const [extra, setExtra] = React.useState(false)
			return (
				<main>
					<button onClick={() => setRevision((value) => value + 1)}>Render</button>
					<button onClick={() => setExtra(true)}>Append</button>
					<select
						data-testid="choice"
						data-revision={revision}
						onChange={() => setRevision((value) => value + 1)}
					>
						<option value={revision >= 2 ? "renamed" : "a"}>Alpha</option>
						{extra && <option value="b">Beta</option>}
					</select>
				</main>
			)
		}
		check(View, [
			{ value: "a" },
			{ change: "" },
			{ value: "" },
			{ click: "Render" },
			{ value: "" },
			{ click: "Append" },
			{ value: "renamed", selected: ["Alpha"] },
		])
	})

	it("does not reapply defaultValue when options arrive after mount", function () {
		function View() {
			const [ready, setReady] = React.useState(false)
			return (
				<main>
					<button onClick={() => setReady(true)}>Populate</button>
					<select
						data-testid="choice"
						defaultValue="b"
					>
						{ready && (
							<>
								<option value="a">Alpha</option>
								<option value="b">Beta</option>
							</>
						)}
					</select>
				</main>
			)
		}
		check(View, [{ click: "Populate" }, { value: "a", selected: ["Alpha"] }])
	})

	it("retains multiple selections by identity without selecting inserted options", function () {
		function View() {
			const [changed, setChanged] = React.useState(false)
			return (
				<main>
					<button onClick={() => setChanged(true)}>Change</button>
					<select
						multiple
						data-testid="choice"
						defaultValue={["a", "b"]}
					>
						{changed && <option value="c">Gamma</option>}
						<option
							key="a"
							value={changed ? "renamed" : "a"}
						>
							Alpha
						</option>
						{!changed && (
							<option
								key="b"
								value="b"
							>
								Beta
							</option>
						)}
					</select>
				</main>
			)
		}
		check(View, [
			{ value: "a", selected: ["Alpha", "Beta"] },
			{ click: "Change" },
			{ value: "renamed", selected: ["Alpha"] },
		])
	})

	it("keeps controlled selection tied to values as options change", function () {
		function View() {
			const [ready, setReady] = React.useState(false)
			return (
				<main>
					<button onClick={() => setReady(true)}>Populate</button>
					<select
						data-testid="choice"
						value="b"
						onChange={() => undefined}
					>
						{ready && (
							<>
								<option value="a">Alpha</option>
								<option value="b">Beta</option>
							</>
						)}
					</select>
				</main>
			)
		}
		check(View, [{ click: "Populate" }, { value: "b", selected: ["Beta"] }])
	})
})
