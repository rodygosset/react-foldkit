import { cleanup, fireEvent, render } from "@testing-library/react"
import { Option, Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import React from "react"
import { afterEach, describe, expect, it } from "vitest"
import * as Application from "../application"
import * as Scene from "../scene"
import {
	bindSceneView,
	createSceneRenderSession,
	disposeSceneRenderSession,
	renderBoundSceneView,
} from "./sceneBinding"
import type { SceneRenderSession } from "./sceneBinding"
import type { HostElement } from "./sceneHost"

const Message = defineMessageUnion({ SetText: { text: Schema.String } })
const update = (_model: string, message: typeof Message.Type) => ({ model: message.text })
const App = Application.define({ Model: Schema.String, Message, update })
const sessions: SceneRenderSession[] = []

afterEach(function () {
	cleanup()
	for (const session of sessions.splice(0)) disposeSceneRenderSession(session)
})

function sceneElement(View: React.ComponentType) {
	const session = createSceneRenderSession()
	sessions.push(session)
	const vnode = renderBoundSceneView(bindSceneView(App, View), "", () => undefined, session)
	if (vnode === undefined) throw new Error("Expected a rendered Scene element")
	return { vnode, element: vnode.elm as unknown as HostElement }
}

describe.each(["React DOM", "Scene"] as const)("%s host contract", function (surface) {
	function mount(View: React.ComponentType): Element | HostElement {
		if (surface === "Scene") return sceneElement(View).element
		const element = render(<View />).container.firstElementChild
		if (element === null) throw new Error("Expected a rendered DOM element")
		return element
	}

	it("normalizes HTML attribute names and boolean values", function () {
		const element = mount(() => (
			<button
				autoCapitalize="words"
				enterKeyHint="go"
				tabIndex={0}
				disabled={false}
				autoFocus={false}
				aria-disabled={false}
				data-active={false}
				draggable={false}
			/>
		))
		expect(element.getAttribute("autocapitalize")).toBe("words")
		expect(element.getAttribute("enterkeyhint")).toBe("go")
		expect(element.getAttribute("tabindex")).toBe("0")
		expect(element.getAttribute("disabled")).toBeNull()
		expect(element.getAttribute("autofocus")).toBeNull()
		expect(element.getAttribute("aria-disabled")).toBe("false")
		expect(element.getAttribute("data-active")).toBe("false")
		expect(element.getAttribute("draggable")).toBe("false")
		const disabled = mount(() => <button disabled />)
		expect(disabled.getAttribute("disabled")).toBe("")
	})

	it("preserves SVG case and uses explicit SVG aliases", function () {
		const element = mount(() => (
			<svg
				viewBox="0 0 10 10"
				preserveAspectRatio="xMidYMid"
				strokeWidth={2}
				fillOpacity={0.5}
			/>
		))
		expect(element.getAttribute("viewBox")).toBe("0 0 10 10")
		expect(element.getAttribute("preserveAspectRatio")).toBe("xMidYMid")
		expect(element.getAttribute("stroke-width")).toBe("2")
		expect(element.getAttribute("fill-opacity")).toBe("0.5")
		expect(element.getAttribute("view-box")).toBeNull()
	})

	it("exposes numeric and empty input and textarea values as strings", function () {
		for (const View of [
			() => (
				<input
					value={42}
					readOnly
				/>
			),
			() => <input defaultValue={42} />,
			() => (
				<textarea
					value={42}
					readOnly
				/>
			),
			() => <textarea defaultValue={42} />,
		]) {
			expect((mount(View) as HTMLInputElement).value).toBe("42")
		}
		for (const View of [() => <input />, () => <textarea />]) {
			expect((mount(View) as HTMLInputElement).value).toBe("")
		}
	})

	it("keeps a multiple select value scalar while selecting all requested options", function () {
		for (const props of [{ defaultValue: ["a", "b"] }, { value: ["a", "b"], onChange: () => undefined }]) {
			const element = mount(() => (
				<select
					multiple
					{...props}
				>
					<option value="a">Alpha</option>
					<option value="b">Beta</option>
				</select>
			)) as HTMLSelectElement
			expect(element.value).toBe("a")
			expect(Array.from(element.children).map((option) => (option as HTMLOptionElement).selected)).toEqual([
				true,
				true,
			])
		}
	})

	it("normalizes numeric select values", function () {
		for (const props of [{ defaultValue: 42 }, { value: 42, onChange: () => undefined }]) {
			const element = mount(() => (
				<select {...props}>
					<option value={42}>Answer</option>
				</select>
			)) as HTMLSelectElement
			expect(element.value).toBe("42")
		}
	})

	it("initializes select values before layout effects observe the ref", function () {
		const seen: Array<string | undefined> = []
		function View() {
			const ref = React.useRef<HTMLSelectElement>(null)
			React.useLayoutEffect(function observeSelectValue() {
				seen.push(ref.current?.value)
			}, [])
			return (
				<select
					ref={ref}
					multiple
					defaultValue={["a", "b"]}
				>
					<option value="a">Alpha</option>
					<option value="b">Beta</option>
				</select>
			)
		}
		mount(View)
		expect(seen).toEqual(["a"])
	})

	it("keeps imperative attribute edits visible", function () {
		const element = mount(() => (
			<button
				title="before"
				tabIndex={0}
			/>
		))
		element.setAttribute("title", "after")
		element.removeAttribute("tabindex")
		expect(element.getAttribute("title")).toBe("after")
		expect(element.getAttribute("tabindex")).toBeNull()
	})
})

it("uses normalized HTML and SVG attributes in Scene snapshots and selectors", function () {
	const { vnode } = sceneElement(() => (
		<main>
			<button
				autoCapitalize="words"
				tabIndex={0}
				disabled={false}
			>
				Enabled
			</button>
			<svg
				viewBox="0 0 10 10"
				strokeWidth={2}
			/>
		</main>
	))
	const children = vnode.children as Array<{ data?: { attrs?: Record<string, unknown> } }>
	expect(children[0]?.data?.attrs).toMatchObject({ autocapitalize: "words", tabindex: "0" })
	expect(children[0]?.data?.attrs).not.toHaveProperty("disabled")
	expect(children[1]?.data?.attrs).toMatchObject({ viewBox: "0 0 10 10", "stroke-width": "2" })
	Scene.scene(
		{
			update,
			view: bindSceneView(App, () => (
				<button
					autoCapitalize="words"
					disabled={false}
				>
					Enabled
				</button>
			)),
		},
		Scene.given(""),
		Scene.expect(Scene.selector('[autocapitalize="words"]:not([disabled])')).toExist(),
		Scene.expect(Scene.role("button", { disabled: false })).toExist()
	)
})

it("reads mapped attributes from the current target inside handlers", function () {
	const seen: Array<string | null> = []
	function View() {
		return (
			<button
				tabIndex={0}
				onKeyDown={(event) => seen.push(event.currentTarget.getAttribute("tabindex"))}
			>
				Go
			</button>
		)
	}
	const { unmount, getByRole } = render(<View />)
	fireEvent.keyDown(getByRole("button"), { key: "Enter" })
	unmount()
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given(""),
		Scene.keydown(Scene.role("button"), "Enter"),
		Scene.expectIgnored()
	)
	expect(seen).toEqual(["0", "0"])
})

it("restores rejected numeric controlled values to strings", function () {
	function View() {
		return (
			<main>
				<input
					aria-label="Input"
					value={42}
					onChange={() => undefined}
				/>
				<textarea
					aria-label="Textarea"
					value={42}
					onChange={() => undefined}
				/>
			</main>
		)
	}
	const dom = render(<View />)
	for (const name of ["Input", "Textarea"]) {
		const element = dom.getByRole("textbox", { name }) as HTMLInputElement
		fireEvent.input(element, { target: { value: "rejected" } })
		expect(element.value).toBe("42")
	}
	dom.unmount()
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given(""),
		Scene.type(Scene.role("textbox", { name: "Input" }), "rejected"),
		Scene.expectIgnored(),
		Scene.expect(Scene.role("textbox", { name: "Input" })).toHaveValue("42"),
		Scene.type(Scene.role("textbox", { name: "Textarea" }), "rejected"),
		Scene.expectIgnored(),
		Scene.expect(Scene.role("textbox", { name: "Textarea" })).toHaveValue("42")
	)
})

it("finds disabled Scene buttons and rejects clicking them", function () {
	let clicks = 0
	const config = {
		update,
		view: bindSceneView(App, () => (
			<button
				disabled
				onClick={() => clicks++}
			>
				Disabled
			</button>
		)),
	}
	Scene.scene(config, Scene.given(""), Scene.expect(Scene.role("button", { disabled: true })).toExist())
	expect(() => Scene.scene(config, Scene.given(""), Scene.click(Scene.role("button")))).toThrow(/disabled/)
	expect(clicks).toBe(0)
})

it("keeps imperative attribute edits in Scene selectors after a handler", function () {
	function View() {
		return (
			<button
				title="before"
				tabIndex={0}
				onKeyDown={function (event) {
					event.currentTarget.setAttribute("title", "after")
					event.currentTarget.setAttribute("class", "changed")
					event.currentTarget.removeAttribute("tabindex")
				}}
			>
				Go
			</button>
		)
	}
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given(""),
		Scene.keydown(Scene.role("button"), "Enter"),
		Scene.expectIgnored(),
		Scene.expect(Scene.selector('.changed[title="after"]:not([tabindex])')).toExist()
	)
})

it("uses the HTML namespace inside an SVG foreignObject", function () {
	function View() {
		return (
			<svg>
				<foreignObject>
					<button
						autoCapitalize="words"
						tabIndex={0}
					/>
				</foreignObject>
			</svg>
		)
	}
	const dom = render(<View />).getByRole("button")
	const { vnode } = sceneElement(View)
	const match = Scene.getByRole("button")(vnode)
	if (Option.isNone(match)) throw new Error("Expected a button inside the SVG foreignObject")
	const button = match.value.elm as unknown as HostElement
	expect(button.getAttribute("autocapitalize")).toBe(dom.getAttribute("autocapitalize"))
	expect(button.getAttribute("tabindex")).toBe(dom.getAttribute("tabindex"))
})

it("updates controlled host values before layout effects read them", function () {
	const seen: Array<ReadonlyArray<string>> = []
	function View() {
		const [value, setValue] = React.useState(1)
		const input = React.useRef<HTMLInputElement>(null)
		const select = React.useRef<HTMLSelectElement>(null)
		React.useLayoutEffect(
			function readValues() {
				seen.push([input.current!.value, select.current!.value])
			},
			[value]
		)
		return (
			<main>
				<input
					ref={input}
					value={value}
					readOnly
				/>
				<select
					ref={select}
					value={value}
					onChange={() => undefined}
				>
					<option value={1}>One</option>
					<option value={2}>Two</option>
				</select>
				<button onClick={() => setValue(2)}>Next</button>
			</main>
		)
	}
	const dom = render(<View />)
	fireEvent.click(dom.getByRole("button"))
	dom.unmount()
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given(""),
		Scene.click(Scene.role("button")),
		Scene.expectIgnored()
	)
	expect(seen).toEqual([
		["1", "1"],
		["2", "2"],
		["1", "1"],
		["2", "2"],
	])
})
