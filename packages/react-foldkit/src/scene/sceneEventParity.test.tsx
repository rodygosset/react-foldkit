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

function Radios() {
	const send = App.useDispatch()
	return (
		<main>
			<input
				type="radio"
				name="choice"
				aria-label="A"
				defaultChecked
				onChange={() => send("a")}
			/>
			<input
				type="radio"
				name="choice"
				aria-label="B"
				onChange={() => send("b")}
			/>
			<p>{App.useModel()}</p>
		</main>
	)
}

it("Scene unchecks the previous radio in the same group", function () {
	Scene.scene(
		{ update, view: bindSceneView(App, Radios) },
		Scene.given("a"),
		Scene.click(Scene.role("radio", { name: "B" })),
		Scene.expect(Scene.role("radio", { name: "B" })).toBeChecked(),
		Scene.expect(Scene.role("radio", { name: "A" })).not.toBeChecked()
	)
})

it("React DOM unchecks the previous radio in the same group", function () {
	render(
		<App.Provider init={{ model: "a" }}>
			<Radios />
		</App.Provider>
	)
	act(function () {
		fireEvent.click(screen.getByRole("radio", { name: "B" }))
	})
	expect((screen.getByRole("radio", { name: "B" }) as HTMLInputElement).checked).toBe(true)
	expect((screen.getByRole("radio", { name: "A" }) as HTMLInputElement).checked).toBe(false)
})

function Keyboard() {
	const send = App.useDispatch()
	return (
		<button onKeyDown={(event) => send(event.target === event.currentTarget ? "self" : "child")}>
			{App.useModel()}
		</button>
	)
}

it("Scene keydown retains self-target identity", function () {
	Scene.scene(
		{ update, view: bindSceneView(App, Keyboard) },
		Scene.given("ready"),
		Scene.keydown(Scene.role("button"), "Enter"),
		Scene.expect(Scene.text("self")).toExist()
	)
})

it("React DOM keydown retains self-target identity", function () {
	render(
		<App.Provider init={{ model: "ready" }}>
			<Keyboard />
		</App.Provider>
	)
	act(function () {
		fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" })
	})
	expect(screen.getByRole("button").textContent).toBe("self")
})

it("radio groups respect explicit form owners across different ancestors", function () {
	function View() {
		const send = App.useDispatch()
		return (
			<main>
				<form id="first">
					<input
						type="radio"
						name="choice"
						aria-label="A"
						defaultChecked
						onChange={() => send("a")}
					/>
				</form>
				<form id="second">
					<input
						type="radio"
						name="choice"
						aria-label="B"
						defaultChecked
						onChange={() => send("b")}
					/>
				</form>
				<input
					type="radio"
					name="choice"
					form="first"
					aria-label="C"
					onChange={() => send("c")}
				/>
			</main>
		)
	}
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given(""),
		Scene.click(Scene.role("radio", { name: "C" })),
		Scene.expect(Scene.role("radio", { name: "A" })).not.toBeChecked(),
		Scene.expect(Scene.role("radio", { name: "B" })).toBeChecked(),
		Scene.expect(Scene.role("radio", { name: "C" })).toBeChecked()
	)
})

it("radios with empty names remain independent", function () {
	function View() {
		const send = App.useDispatch()
		return (
			<main>
				<input
					type="radio"
					name=""
					aria-label="A"
					defaultChecked
					onChange={() => send("a")}
				/>
				<input
					type="radio"
					name=""
					aria-label="B"
					onChange={() => send("b")}
				/>
			</main>
		)
	}
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given(""),
		Scene.click(Scene.role("radio", { name: "B" })),
		Scene.expect(Scene.role("radio", { name: "A" })).toBeChecked(),
		Scene.expect(Scene.role("radio", { name: "B" })).toBeChecked()
	)
})

it("canceling a radio click restores all radios in the group", function () {
	const seen: boolean[] = []
	function View() {
		return (
			<main onClick={(event) => event.preventDefault()}>
				<input
					type="radio"
					name="choice"
					aria-label="A"
					defaultChecked
				/>
				<input
					type="radio"
					name="choice"
					aria-label="B"
					onChange={(event) => seen.push(event.currentTarget.checked)}
				/>
			</main>
		)
	}
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given(""),
		Scene.click(Scene.role("radio", { name: "B" })),
		Scene.expectIgnored(),
		Scene.expect(Scene.role("radio", { name: "A" })).toBeChecked(),
		Scene.expect(Scene.role("radio", { name: "B" })).not.toBeChecked()
	)
	expect(seen).toEqual([true])
})

it("a direct keyboard event has the same host node as its two targets", function () {
	function View() {
		const send = App.useDispatch()
		return (
			<input
				name="query"
				value={App.useModel()}
				onChange={(event) => send(event.currentTarget.value)}
				onKeyDown={function (event) {
					expect(event.target).toBe(event.currentTarget)
					expect((event.target as HTMLInputElement).name).toBe("query")
					send(event.key)
				}}
			/>
		)
	}
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given(""),
		Scene.keydown(Scene.role("textbox"), "Enter"),
		Scene.expect(Scene.role("textbox")).toHaveValue("Enter")
	)
})
