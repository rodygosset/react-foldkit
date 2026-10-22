import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Schema } from "effect"
import React from "react"
import { afterEach, expect, it } from "vitest"
import * as Application from "../application"
import * as Scene from "../scene"
import { bindSceneView } from "./react"

afterEach(cleanup)

const update = (_model: string, message: string) => ({ model: message })
const App = Application.define({ Model: Schema.String, Message: Schema.String, update })

it("restores a controlled checkbox when its change handler leaves the Model unchanged", function () {
	function View() {
		return (
			<input
				type="checkbox"
				checked={false}
				onChange={function () {}}
			/>
		)
	}
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given(""),
		Scene.click(Scene.role("checkbox")),
		Scene.expectIgnored(),
		Scene.expect(Scene.role("checkbox")).not.toBeChecked()
	)
})
it("restores a controlled text input when its change handler rejects the value", function () {
	function View() {
		return (
			<input
				value="fixed"
				onChange={function () {}}
			/>
		)
	}
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given(""),
		Scene.type(Scene.role("textbox"), "rejected"),
		Scene.expectIgnored(),
		Scene.expect(Scene.role("textbox")).toHaveValue("fixed")
	)
})
it("delivers input changes to a parent React handler", function () {
	function View() {
		const send = App.useDispatch()
		return (
			<main onChange={(event) => send((event.target as HTMLInputElement).value)}>
				<input defaultValue="" />
				<p>{App.useModel()}</p>
			</main>
		)
	}
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given(""),
		Scene.type(Scene.role("textbox"), "Ada"),
		Scene.expect(Scene.text("Ada")).toExist()
	)
})
it("preserves the child target of a delegated double click", function () {
	function View() {
		const send = App.useDispatch()
		return (
			<main onDoubleClick={(event) => send((event.target as HTMLElement).tagName)}>
				<button>Go</button>
				<p>{App.useModel()}</p>
			</main>
		)
	}
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given(""),
		Scene.doubleClick(Scene.role("button")),
		Scene.expect(Scene.text("BUTTON")).toExist()
	)
})
it("preserves a direct pointer target's identity", function () {
	function View() {
		const send = App.useDispatch()
		return (
			<button onPointerDown={(event) => send(event.target === event.currentTarget ? "self" : "other")}>
				{App.useModel()}
			</button>
		)
	}
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given("ready"),
		Scene.pointerDown(Scene.role("button")),
		Scene.expect(Scene.text("self")).toExist()
	)
})
it("runs click capture handlers before bubble handlers", function () {
	const calls: string[] = []
	function View() {
		const send = App.useDispatch()
		return (
			<main
				onClickCapture={function () {
					calls.push("capture")
				}}
			>
				<button
					onClick={function () {
						calls.push("bubble")
						send("clicked")
					}}
				>
					Go
				</button>
			</main>
		)
	}
	Scene.scene({ update, view: bindSceneView(App, View) }, Scene.given(""), Scene.click(Scene.role("button")))
	expect(calls).toEqual(["capture", "bubble"])
})

it("React DOM restores controlled values rejected by a handler", function () {
	render(
		<main>
			<input
				aria-label="Text"
				value="fixed"
				onChange={function () {}}
			/>
			<input
				type="checkbox"
				checked={false}
				onChange={function () {}}
			/>
		</main>
	)
	act(function () {
		fireEvent.input(screen.getByRole("textbox"), { target: { value: "rejected" } })
		fireEvent.click(screen.getByRole("checkbox"))
	})
	expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("fixed")
	expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false)
})
it("React DOM delivers parent change handlers and capture handlers", function () {
	const calls: string[] = []
	function View() {
		const send = App.useDispatch()
		return (
			<main
				onChange={(event) => send((event.target as HTMLInputElement).value)}
				onClickCapture={function () {
					calls.push("capture")
				}}
			>
				<input defaultValue="" />
				<button
					onClick={function () {
						calls.push("bubble")
					}}
				>
					Go
				</button>
				<p>{App.useModel()}</p>
			</main>
		)
	}
	render(
		<App.Provider init={{ model: "" }}>
			<View />
		</App.Provider>
	)
	act(function () {
		fireEvent.input(screen.getByRole("textbox"), { target: { value: "Ada" } })
		fireEvent.click(screen.getByRole("button"))
	})
	expect(screen.getByText("Ada")).toBeTruthy()
	expect(calls).toEqual(["capture", "bubble"])
})
it("React DOM preserves double click targets and pointer target identity", function () {
	const calls: string[] = []
	render(
		<main onDoubleClick={(event) => calls.push((event.target as HTMLElement).tagName)}>
			<button onPointerDown={(event) => calls.push(event.target === event.currentTarget ? "self" : "other")}>
				Go
			</button>
		</main>
	)
	act(function () {
		fireEvent.doubleClick(screen.getByRole("button"))
		fireEvent.pointerDown(screen.getByRole("button"))
	})
	expect(calls).toEqual(["BUTTON", "self"])
})

it("focus capture and bubble handlers observe the input's original target", function () {
	const calls: string[] = []
	function View() {
		const send = App.useDispatch()
		return (
			<main
				onFocusCapture={function (event) {
					calls.push("capture")
					expect((event.target as HTMLElement).tagName).toBe("INPUT")
				}}
				onFocus={function (event) {
					expect(event.currentTarget.contains(event.relatedTarget)).toBe(false)
					calls.push("bubble")
					send("focused")
				}}
			>
				<input />
			</main>
		)
	}
	Scene.scene({ update, view: bindSceneView(App, View) }, Scene.given(""), Scene.focus(Scene.role("textbox")))
	expect(calls).toEqual(["capture", "bubble"])
})
it("capture stopPropagation prevents target and parent bubble handlers", function () {
	const calls: string[] = []
	function View() {
		return (
			<main
				onClickCapture={function (event) {
					calls.push("capture")
					event.stopPropagation()
				}}
				onClick={function () {
					calls.push("parent")
				}}
			>
				<button
					onClick={function () {
						calls.push("target")
					}}
				>
					Go
				</button>
			</main>
		)
	}
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given(""),
		Scene.click(Scene.role("button")),
		Scene.expectIgnored()
	)
	expect(calls).toEqual(["capture"])
})
it("input and change propagation run once each and preserve data-last steps", function () {
	const calls: string[] = []
	function View() {
		const send = App.useDispatch()
		return (
			<main
				onInput={function () {
					calls.push("input-parent")
				}}
				onChange={function () {
					calls.push("change-parent")
				}}
			>
				<input
					value={App.useModel()}
					onInput={function () {
						calls.push("input-child")
					}}
					onChange={function (event) {
						calls.push("change-child")
						send(event.target.value)
					}}
				/>
			</main>
		)
	}
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given(""),
		Scene.type("Ada")(Scene.role("textbox")),
		Scene.expect(Scene.role("textbox")).toHaveValue("Ada"),
		Scene.change("Grace")(Scene.role("textbox")),
		Scene.expect(Scene.role("textbox")).toHaveValue("Grace")
	)
	expect(calls).toEqual([
		"input-child",
		"input-parent",
		"change-child",
		"change-parent",
		"change-child",
		"change-parent",
	])
})
it("checkbox changes bubble from an input without its own handler", function () {
	function View() {
		const send = App.useDispatch()
		return (
			<main onChange={(event) => send(String((event.target as HTMLInputElement).checked))}>
				<input type="checkbox" />
				<p>{App.useModel()}</p>
			</main>
		)
	}
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given(""),
		Scene.click(Scene.role("checkbox")),
		Scene.expect(Scene.text("true")).toExist()
	)
})
it("pointer events retain dataset and closest matches on the real host path", function () {
	function View() {
		const send = App.useDispatch()
		return (
			<main
				onPointerDown={function (event) {
					const target = event.target as HTMLElement
					expect(target.closest<HTMLElement>('button[data-action="save"]')?.dataset.action).toBe("save")
					send(target.dataset.part ?? "missing")
				}}
			>
				<button data-action="save">
					<span data-part="label">Go</span>
				</button>
				<p>{App.useModel()}</p>
			</main>
		)
	}
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given(""),
		Scene.pointerDown(Scene.text("Go")),
		Scene.expect(Scene.text("label")).toExist()
	)
})
it("keyboard data-last calls preserve modifiers", function () {
	function View() {
		const send = App.useDispatch()
		return (
			<input
				value={App.useModel()}
				onChange={(event) => send(event.target.value)}
				onKeyDown={(event) => send(event.ctrlKey ? event.key : "missing")}
			/>
		)
	}
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given(""),
		Scene.keydown("Enter", { ctrlKey: true })(Scene.role("textbox")),
		Scene.expect(Scene.role("textbox")).toHaveValue("Enter")
	)
})
it("rejects multiple host roots rather than silently dropping their siblings", function () {
	function View() {
		return (
			<>
				<p>First</p>
				<p>Second</p>
			</>
		)
	}
	expect(() => Scene.scene({ update, view: bindSceneView(App, View) }, Scene.given(""))).toThrow(/one host element/)
})

it("native Foldkit views keep upstream behavior for adapted data-last interactions", function () {
	const view = (model: string, h: import("foldkit/html").HtmlBuilder<string>) =>
		h.input([h.Value(model), h.OnInput((value) => value), h.OnChange((value) => value), h.OnKeyDown((key) => key)])
	Scene.scene(
		{ update, view },
		Scene.given(""),
		Scene.type("Ada")(Scene.role("textbox")),
		Scene.expect(Scene.role("textbox")).toHaveValue("Ada"),
		Scene.change("Grace")(Scene.role("textbox")),
		Scene.expect(Scene.role("textbox")).toHaveValue("Grace"),
		Scene.keydown("Enter")(Scene.role("textbox")),
		Scene.expect(Scene.role("textbox")).toHaveValue("Enter")
	)
})
it("data-last file selection and drops preserve their event payloads", function () {
	const file = new File(["content"], "profile.txt")
	function View() {
		const send = App.useDispatch()
		return (
			<main
				onDrop={function (event) {
					event.preventDefault()
					send(event.dataTransfer.files[0]?.name ?? "missing")
				}}
			>
				<input
					type="file"
					data-testid="file"
					onChange={(event) => send(event.currentTarget.files?.[0]?.name ?? "missing")}
				/>
				<span data-testid="drop">Drop</span>
				<p>{App.useModel()}</p>
			</main>
		)
	}
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given(""),
		Scene.changeFiles([file])(Scene.testId("file")),
		Scene.expect(Scene.text("profile.txt")).toExist(),
		Scene.dropFiles([file])(Scene.testId("drop")),
		Scene.expect(Scene.text("profile.txt")).toExist()
	)
})

it("selected option matchers follow a controlled select value", function () {
	function View() {
		const send = App.useDispatch()
		return (
			<select
				value={App.useModel()}
				onChange={(event) => send(event.target.value)}
			>
				<option value="a">Alpha</option>
				<option value="b">Beta</option>
			</select>
		)
	}
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given("a"),
		Scene.expect(Scene.role("option", { name: "Alpha", selected: true })).toExist(),
		Scene.change(Scene.role("combobox"), "b"),
		Scene.expect(Scene.role("option", { name: "Beta", selected: true })).toExist(),
		Scene.expect(Scene.role("option", { name: "Alpha", selected: false })).toExist()
	)
})
it("React DOM selected options follow a controlled select value", function () {
	function View() {
		const send = App.useDispatch()
		return (
			<select
				value={App.useModel()}
				onChange={(event) => send(event.target.value)}
			>
				<option value="a">Alpha</option>
				<option value="b">Beta</option>
			</select>
		)
	}
	render(
		<App.Provider init={{ model: "a" }}>
			<View />
		</App.Provider>
	)
	expect((screen.getByRole("option", { name: "Alpha" }) as HTMLOptionElement).selected).toBe(true)
	act(function () {
		fireEvent.change(screen.getByRole("combobox"), { target: { value: "b" } })
	})
	expect((screen.getByRole("option", { name: "Beta" }) as HTMLOptionElement).selected).toBe(true)
})

it("hover dispatches mouseover followed by parent-first mouseenter handlers", function () {
	const calls: string[] = []
	function View() {
		return (
			<main
				onMouseOver={function () {
					calls.push("over-parent")
				}}
				onMouseEnter={function () {
					calls.push("enter-parent")
				}}
			>
				<button
					onMouseOver={function () {
						calls.push("over-child")
					}}
					onMouseEnter={function () {
						calls.push("enter-child")
					}}
				>
					Go
				</button>
			</main>
		)
	}
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given(""),
		Scene.hover(Scene.role("button")),
		Scene.expectIgnored()
	)
	expect(calls).toEqual(["over-child", "over-parent", "enter-parent", "enter-child"])
})
it("React DOM hover dispatches mouseover followed by parent-first mouseenter handlers", function () {
	const calls: string[] = []
	render(
		<main
			onMouseOver={function () {
				calls.push("over-parent")
			}}
			onMouseEnter={function () {
				calls.push("enter-parent")
			}}
		>
			<button
				onMouseOver={function () {
					calls.push("over-child")
				}}
				onMouseEnter={function () {
					calls.push("enter-child")
				}}
			>
				Go
			</button>
		</main>
	)
	act(function () {
		fireEvent.mouseOver(screen.getByRole("button"))
	})
	expect(calls).toEqual(["over-child", "over-parent", "enter-parent", "enter-child"])
})
it("selects default and multiple values before taking option snapshots", function () {
	function View() {
		return (
			<main>
				<select aria-label="Single">
					<option disabled>Unavailable</option>
					<option value="a">Alpha</option>
					<option value="b">Beta</option>
				</select>
				<select
					aria-label="Multiple"
					multiple
					defaultValue={["a", "b"]}
				>
					<option value="a">First</option>
					<option value="b">Second</option>
				</select>
			</main>
		)
	}
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given(""),
		Scene.expect(Scene.role("combobox")).toHaveValue("a"),
		Scene.expect(Scene.role("option", { name: "First", selected: true })).toExist(),
		Scene.expect(Scene.role("option", { name: "Second", selected: true })).toExist()
	)
})
