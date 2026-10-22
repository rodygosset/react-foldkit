import { cleanup, fireEvent, render } from "@testing-library/react"
import { Schema } from "effect"
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
			<svg viewBox="0 0 10 10" preserveAspectRatio="xMidYMid" strokeWidth={2} fillOpacity={0.5} />
		))
		expect(element.getAttribute("viewBox")).toBe("0 0 10 10")
		expect(element.getAttribute("preserveAspectRatio")).toBe("xMidYMid")
		expect(element.getAttribute("stroke-width")).toBe("2")
		expect(element.getAttribute("fill-opacity")).toBe("0.5")
		expect(element.getAttribute("view-box")).toBeNull()
	})

	it("exposes numeric and empty input and textarea values as strings", function () {
		for (const View of [
			() => <input value={42} readOnly />,
			() => <input defaultValue={42} />,
			() => <textarea value={42} readOnly />,
			() => <textarea defaultValue={42} />,
		]) {
			expect((mount(View) as HTMLInputElement).value).toBe("42")
		}
		for (const View of [() => <input />, () => <textarea />]) {
			expect((mount(View) as HTMLInputElement).value).toBe("")
		}
	})

	it("keeps a multiple select value scalar while selecting all requested options", function () {
		const element = mount(() => (
			<select multiple defaultValue={["a", "b"]}>
				<option value="a">Alpha</option>
				<option value="b">Beta</option>
			</select>
		)) as HTMLSelectElement
		expect(element.value).toBe("a")
		expect(Array.from(element.children).map((option) => (option as HTMLOptionElement).selected)).toEqual([
			true,
			true,
		])
	})
})

it("uses normalized HTML and SVG attributes in Scene snapshots and selectors", function () {
	const { vnode } = sceneElement(() => (
		<main>
			<button autoCapitalize="words" tabIndex={0} disabled={false}>Enabled</button>
			<svg viewBox="0 0 10 10" strokeWidth={2} />
		</main>
	))
	const children = vnode.children as Array<{ data?: { attrs?: Record<string, unknown> } }>
	expect(children[0]?.data?.attrs).toMatchObject({ autocapitalize: "words", tabindex: "0" })
	expect(children[0]?.data?.attrs).not.toHaveProperty("disabled")
	expect(children[1]?.data?.attrs).toMatchObject({ viewBox: "0 0 10 10", "stroke-width": "2" })
	Scene.scene(
		{ update, view: bindSceneView(App, () => <button autoCapitalize="words" disabled={false}>Enabled</button>) },
		Scene.given(""),
		Scene.expect(Scene.selector('[autocapitalize="words"]:not([disabled])')).toExist(),
		Scene.expect(Scene.role("button", { disabled: false })).toExist()
	)
})

it("reads mapped attributes from the current target inside handlers", function () {
	const seen: Array<string | null> = []
	function View() {
		return <button tabIndex={0} onKeyDown={(event) => seen.push(event.currentTarget.getAttribute("tabindex"))}>Go</button>
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
		return <main><input aria-label="Input" value={42} onChange={() => undefined} /><textarea aria-label="Textarea" value={42} onChange={() => undefined} /></main>
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
	const config = { update, view: bindSceneView(App, () => <button disabled onClick={() => clicks++}>Disabled</button>) }
	Scene.scene(config, Scene.given(""), Scene.expect(Scene.role("button", { disabled: true })).toExist())
	expect(() => Scene.scene(config, Scene.given(""), Scene.click(Scene.role("button")))).toThrow(/disabled/)
	expect(clicks).toBe(0)
})
