import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Option, Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import React from "react"
import { afterEach, expect, it } from "vitest"
import * as Application from "../application"
import * as Scene from "../scene"
import { bindSceneView } from "./react"

afterEach(cleanup)

const Message = defineMessageUnion({ SetText: { text: Schema.String } })
type Message = typeof Message.Type
const update = (_model: string, message: Message) => ({ model: message.text })
const App = Application.define({ Model: Schema.String, Message, update })

for (const runtime of ["React DOM", "Scene"] as const) {
	it(`${runtime} reports React event types for every Scene interaction`, function () {
		const events: React.SyntheticEvent[] = []
		const record = (event: React.SyntheticEvent) => events.push(event)
		function View() {
			return (
				<form
					aria-label="Form"
					onSubmit={function (event) {
						record(event)
						event.preventDefault()
					}}
				>
					<button
						type="button"
						onClick={record}
						onDoubleClick={record}
						onContextMenu={record}
						onPointerDown={record}
						onPointerUp={record}
						onMouseOver={record}
						onMouseEnter={record}
						onFocus={record}
						onBlur={record}
						onKeyDown={record}
					>
						Go
					</button>
					<input
						aria-label="Text"
						onInput={record}
						onChange={record}
						onBeforeInput={record}
					/>
					<select
						aria-label="Choice"
						onChange={record}
					>
						<option value="a">A</option>
						<option value="b">B</option>
					</select>
					<input
						aria-label="File"
						type="file"
						onChange={record}
					/>
					<div
						role="region"
						aria-label="Drop"
						onDrop={record}
					/>
					<div
						role="textbox"
						aria-label="Editable"
						contentEditable
						onInput={record}
					/>
				</form>
			)
		}
		if (runtime === "Scene") {
			Scene.scene(
				{ update, view: bindSceneView(App, View) },
				Scene.given(""),
				Scene.click(Scene.role("button")),
				Scene.expectIgnored(),
				Scene.doubleClick(Scene.role("button")),
				Scene.expectIgnored(),
				Scene.contextMenu(Scene.role("button")),
				Scene.expectIgnored(),
				Scene.pointerDown(Scene.role("button")),
				Scene.expectIgnored(),
				Scene.pointerUp(Scene.role("button")),
				Scene.expectIgnored(),
				Scene.hover(Scene.role("button")),
				Scene.expectIgnored(),
				Scene.focus(Scene.role("button")),
				Scene.expectIgnored(),
				Scene.blur(Scene.role("button")),
				Scene.expectIgnored(),
				Scene.focusEnter(Scene.role("button")),
				Scene.expectIgnored(),
				Scene.focusLeave(Scene.role("button")),
				Scene.expectIgnored(),
				Scene.keydown(Scene.role("button"), "Enter"),
				Scene.expectIgnored(),
				Scene.type(Scene.role("textbox", { name: "Text" }), "Ada"),
				Scene.expectIgnored(),
				Scene.change(Scene.role("combobox"), "b"),
				Scene.expectIgnored(),
				Scene.changeFiles(Scene.selector('input[type="file"]'), []),
				Scene.expectIgnored(),
				Scene.dropFiles(Scene.role("region"), []),
				Scene.expectIgnored(),
				Scene.typeContentEditable(Scene.role("textbox", { name: "Editable" }), "Hi"),
				Scene.expectIgnored(),
				Scene.beforeInput(Scene.role("textbox", { name: "Text" }), "insertText", Option.some(" ")),
				Scene.expectIgnored(),
				Scene.submit(Scene.role("form")),
				Scene.expectIgnored()
			)
		} else {
			render(<View />)
			act(function () {
				const button = screen.getByRole("button")
				fireEvent.click(button)
				fireEvent.doubleClick(button)
				fireEvent.contextMenu(button)
				fireEvent.pointerDown(button)
				fireEvent.pointerUp(button)
				fireEvent.mouseOver(button)
				fireEvent.focusIn(button)
				fireEvent.focusOut(button)
				fireEvent.focusIn(button)
				fireEvent.focusOut(button)
				fireEvent.keyDown(button, { key: "Enter" })
				const text = screen.getByRole("textbox", { name: "Text" })
				fireEvent.input(text, { target: { value: "Ada" } })
				fireEvent.change(screen.getByRole("combobox"), { target: { value: "b" } })
				fireEvent.change(screen.getByLabelText("File"), { target: { files: [] } })
				fireEvent.drop(screen.getByRole("region"))
				fireEvent.input(screen.getByRole("textbox", { name: "Editable" }))
				if ("TextEvent" in window) {
					fireEvent(text, new InputEvent("textInput", { bubbles: true, data: " " }))
				} else {
					fireEvent.keyPress(text, { charCode: 32, which: 32, key: " " })
				}
				fireEvent.submit(screen.getByRole("form"))
			})
		}
		expect(events.map((event) => event.type)).toEqual([
			"click",
			"dblclick",
			"contextmenu",
			"pointerdown",
			"pointerup",
			"mouseover",
			"mouseenter",
			"focus",
			"blur",
			"focus",
			"blur",
			"keydown",
			"input",
			"change",
			"change",
			"change",
			"drop",
			"input",
			"beforeinput",
			"submit",
		])
	})

	it(`${runtime} gives input and change distinct events with independent propagation`, function () {
		const events: React.SyntheticEvent[] = []
		const calls: string[] = []
		function View() {
			return (
				<main
					onInput={() => calls.push("parent input")}
					onChange={(event) => calls.push(`parent ${event.type}`)}
				>
					<input
						onInput={function (event) {
							events.push(event)
							expect(event.isPropagationStopped()).toBe(false)
							event.preventDefault()
							event.stopPropagation()
							expect(event.isPropagationStopped()).toBe(true)
						}}
						onChange={function (event) {
							events.push(event)
							expect(event.isPropagationStopped()).toBe(false)
							expect(event.isDefaultPrevented()).toBe(false)
						}}
					/>
				</main>
			)
		}
		if (runtime === "Scene") {
			Scene.scene(
				{ update, view: bindSceneView(App, View) },
				Scene.given(""),
				Scene.type(Scene.role("textbox"), "Ada"),
				Scene.expectIgnored()
			)
		} else {
			render(<View />)
			act(function () {
				fireEvent.input(screen.getByRole("textbox"), { target: { value: "Ada" } })
			})
		}
		expect(events).toHaveLength(2)
		expect(events[0]).not.toBe(events[1])
		expect(events.map((event) => event.type)).toEqual(["input", "change"])
		expect(calls).toEqual(["parent change"])
	})

	it.each(["capture", "bubble"])(`${runtime} preserves checkbox native cancellation from %s`, function (phase) {
		const events: React.SyntheticEvent[] = []
		const states: boolean[] = []
		function View() {
			return (
				<input
					type="checkbox"
					onClickCapture={function (event) {
						if (phase === "capture") event.preventDefault()
					}}
					onClick={function (event) {
						events.push(event)
						states.push(event.defaultPrevented, event.isDefaultPrevented(), event.isPropagationStopped())
						event.preventDefault()
						event.stopPropagation()
						states.push(event.defaultPrevented, event.isDefaultPrevented(), event.isPropagationStopped())
					}}
					onChange={function (event) {
						events.push(event)
						states.push(event.defaultPrevented, event.isDefaultPrevented(), event.isPropagationStopped())
					}}
				/>
			)
		}
		if (runtime === "Scene") {
			Scene.scene(
				{ update, view: bindSceneView(App, View) },
				Scene.given(""),
				Scene.click(Scene.role("checkbox")),
				Scene.expectIgnored(),
				Scene.expect(Scene.role("checkbox")).not.toBeChecked()
			)
		} else {
			render(<View />)
			act(function () {
				fireEvent.click(screen.getByRole("checkbox"))
			})
			expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false)
		}
		expect(events).toHaveLength(2)
		expect(events[0]).not.toBe(events[1])
		expect(events.map((event) => event.type)).toEqual(["click", "change"])
		expect(states).toEqual([
			phase === "capture",
			phase === "capture",
			false,
			true,
			true,
			true,
			phase === "capture",
			phase === "capture",
			false,
		])
	})

	it(`${runtime} cancels checkbox activation from change without mutating the click event`, function () {
		const events: React.SyntheticEvent[] = []
		function View() {
			return (
				<input
					type="checkbox"
					onClick={(event) => events.push(event)}
					onChange={function (event) {
						events.push(event)
						event.preventDefault()
					}}
				/>
			)
		}
		if (runtime === "Scene") {
			Scene.scene(
				{ update, view: bindSceneView(App, View) },
				Scene.given(""),
				Scene.click(Scene.role("checkbox")),
				Scene.expectIgnored(),
				Scene.expect(Scene.role("checkbox")).not.toBeChecked()
			)
		} else {
			render(<View />)
			act(function () {
				fireEvent.click(screen.getByRole("checkbox"))
			})
			expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false)
		}
		expect(events.map((event) => [event.type, event.defaultPrevented, event.isDefaultPrevented()])).toEqual([
			["click", false, false],
			["change", true, true],
		])
	})

	it(`${runtime} exposes cancellation and propagation methods during capture and bubble`, function () {
		const calls: string[] = []
		function View() {
			return (
				<main
					onClickCapture={(event) =>
						calls.push(
							`parent capture ${event.type} ${event.isDefaultPrevented()} ${event.isPropagationStopped()}`
						)
					}
					onClick={() => calls.push("parent bubble")}
				>
					<button
						onClickCapture={function (event) {
							calls.push(
								`target capture ${event.type} ${event.isDefaultPrevented()} ${event.isPropagationStopped()}`
							)
							event.preventDefault()
						}}
						onClick={function (event) {
							calls.push(
								`target bubble ${event.type} ${event.defaultPrevented} ${event.isDefaultPrevented()} ${event.isPropagationStopped()}`
							)
							event.stopPropagation()
							calls.push(`stopped ${event.isPropagationStopped()}`)
						}}
					>
						Go
					</button>
				</main>
			)
		}
		if (runtime === "Scene") {
			Scene.scene(
				{ update, view: bindSceneView(App, View) },
				Scene.given(""),
				Scene.click(Scene.role("button")),
				Scene.expectIgnored()
			)
		} else {
			render(<View />)
			act(function () {
				fireEvent.click(screen.getByRole("button"))
			})
		}
		expect(calls).toEqual([
			"parent capture click false false",
			"target capture click false false",
			"target bubble click true true false",
			"stopped true",
		])
	})
}
