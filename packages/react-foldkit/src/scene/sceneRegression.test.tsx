import { Effect, Schema } from "effect"
import * as Command from "foldkit/command"
import { defineMessageUnion } from "foldkit/message"
import React from "react"
import { expect, it } from "vitest"
import * as Application from "../application"
import * as Scene from "../scene"
import { bindSceneView } from "./react"
import * as Submodel from "../submodel"

const update = (_model: string, message: string) => ({ model: message })
const App = Application.define({ Model: Schema.String, Message: Schema.String, update })

it("typing into a textarea calls onInput and onChange once with the same value", function () {
	const calls: string[] = []
	function View() {
		const send = App.useDispatch()
		const [local, setLocal] = React.useState(0)
		return (
			<textarea
				data-local={local}
				value={App.useModel()}
				onInput={function (event) {
					calls.push(`input:${event.currentTarget.value}`)
					setLocal(1)
				}}
				onChange={function (event) {
					calls.push(`change:${event.currentTarget.value}`)
					send(event.currentTarget.value)
				}}
			/>
		)
	}
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given(""),
		Scene.type(Scene.role("textbox"), "Ada"),
		Scene.expect(Scene.role("textbox")).toHaveValue("Ada")
	)
	expect(calls).toEqual(["input:Ada", "change:Ada"])
})

it("keeps Commands returned by effect messages pending until the test resolves them", function () {
	const Message = defineMessageUnion({ Load: {}, Loaded: {} })
	let executed = false
	const Load = Command.define("LoadFromEffect", {
		messages: [Message.Loaded],
		execute: Effect.sync(function () {
			executed = true
			return Message.Loaded()
		}),
	})
	const updateEffect = (_model: string, message: typeof Message.Type) =>
		message._tag === "Load" ? { model: "loading", commands: [Load()] } : { model: "ready" }
	const EffectApp = Application.define({ Model: Schema.String, Message, update: updateEffect })
	function View() {
		const send = EffectApp.useSend()
		React.useEffect(
			function load() {
				send.Load()
			},
			[send]
		)
		return <p>{EffectApp.useModel()}</p>
	}
	const view = bindSceneView(EffectApp, View)
	expect(() => Scene.scene({ update: updateEffect, view }, Scene.given("waiting"))).toThrow(/LoadFromEffect/)
	Scene.scene(
		{ update: updateEffect, view },
		Scene.given("waiting"),
		Scene.Command.expectExact(Load()),
		Scene.Command.resolve(Load, Message.Loaded()),
		Scene.expect(Scene.text("ready")).toExist()
	)
	expect(executed).toBe(false)
})

it("captures OutMessages produced by effect messages", function () {
	function View() {
		const send = App.useDispatch()
		React.useEffect(
			function markReady() {
				send("ready")
			},
			[send]
		)
		return <p>{App.useModel()}</p>
	}
	Scene.scene(
		{
			update: (_model: string, message: string) => ({ model: message, outMessage: message }),
			view: bindSceneView(App, View),
		},
		Scene.given("waiting"),
		Scene.expectOutMessage("ready"),
		Scene.expect(Scene.text("ready")).toExist()
	)
})

it("does not rerun React effects for assertions or unchanged Model snapshots", function () {
	let effects = 0
	function View() {
		const send = App.useDispatch()
		const model = App.useModel()
		React.useEffect(function observeRender() {
			effects++
			send(model)
		})
		return <p>{model}</p>
	}
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given("ready"),
		Scene.expect(Scene.text("ready")).toExist(),
		Scene.expect(Scene.text("ready")).toHaveText("ready")
	)
	expect(effects).toBe(1)
})

it("captures messages from effects after a click changes local state", function () {
	function View() {
		const send = App.useDispatch()
		const [clicked, setClicked] = React.useState(false)
		React.useEffect(
			function markClicked() {
				if (clicked) send("ready")
			},
			[clicked, send]
		)
		return (
			<main>
				<button onClick={() => setClicked(true)}>Go</button>
				<p>{App.useModel()}</p>
			</main>
		)
	}
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given("waiting"),
		Scene.click(Scene.role("button")),
		Scene.expect(Scene.text("ready")).toExist()
	)
})

it("applies effects after a Model update within scoped steps", function () {
	function View() {
		const model = App.useModel()
		const send = App.useDispatch()
		React.useEffect(
			function complete() {
				if (model === "clicked") send("ready")
			},
			[model, send]
		)
		return (
			<main>
				<button onClick={() => send("clicked")}>Go</button>
				<p>{model}</p>
			</main>
		)
	}
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given("waiting"),
		Scene.inside(Scene.role("main"), Scene.click(Scene.role("button")), Scene.expect(Scene.text("ready")).toExist())
	)
})

it("limits message loops from effects and still unmounts the view", function () {
	let cleaned = false
	function View() {
		const model = App.useModel()
		const send = App.useDispatch()
		React.useEffect(
			function loop() {
				send(model === "a" ? "b" : "a")
			},
			[model, send]
		)
		React.useEffect(function trackCleanup() {
			return function () {
				cleaned = true
			}
		}, [])
		return <p>{model}</p>
	}
	expect(() => Scene.scene({ update, view: bindSceneView(App, View) }, Scene.given("a"))).toThrow(/did not settle/)
	expect(cleaned).toBe(true)
})

it("checkbox click handlers see the new value even when they change local state", function () {
	const clicks: boolean[] = []
	function View() {
		const send = App.useDispatch()
		const [local, setLocal] = React.useState(0)
		return (
			<input
				type="checkbox"
				checked={App.useModel() === "yes"}
				data-local={local}
				onClick={function (event) {
					clicks.push(event.currentTarget.checked)
					setLocal(1)
				}}
				onChange={function (event) {
					expect(event.target).toBe(event.currentTarget)
					send(event.currentTarget.checked ? "yes" : "no")
				}}
			/>
		)
	}
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given("no"),
		Scene.click(Scene.role("checkbox")),
		Scene.expect(Scene.role("checkbox")).toBeChecked()
	)
	expect(clicks).toEqual([true])
})

it("a parent can cancel an uncontrolled checkbox click after the child handlers run", function () {
	const values: boolean[] = []
	function View() {
		return (
			<div onClick={(event) => event.preventDefault()}>
				<input
					type="checkbox"
					defaultChecked={false}
					onChange={(event) => values.push(event.currentTarget.checked)}
				/>
			</div>
		)
	}
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given(""),
		Scene.click(Scene.role("checkbox")),
		Scene.expectIgnored(),
		Scene.expect(Scene.role("checkbox")).not.toBeChecked()
	)
	expect(values).toEqual([true])
})

it("uncontrolled checkboxes retain their value across renders and repeated clicks", function () {
	function View() {
		const send = App.useDispatch()
		return (
			<input
				type="checkbox"
				defaultChecked={false}
				onChange={(event) => send(String(event.currentTarget.checked))}
			/>
		)
	}
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given(""),
		Scene.click(Scene.role("checkbox")),
		Scene.expect(Scene.role("checkbox")).toBeChecked(),
		Scene.click(Scene.role("checkbox")),
		Scene.expect(Scene.role("checkbox")).not.toBeChecked()
	)
})

it("an already selected radio does not emit another change", function () {
	let changes = 0
	function View() {
		return (
			<input
				type="radio"
				defaultChecked
				onChange={function () {
					changes++
				}}
			/>
		)
	}
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given(""),
		Scene.click(Scene.role("radio")),
		Scene.expectIgnored(),
		Scene.expect(Scene.role("radio")).toBeChecked()
	)
	expect(changes).toBe(0)
})

it("a delegated click preserves target identity and stops at stopPropagation", function () {
	const calls: string[] = []
	function View() {
		const send = App.useDispatch()
		return (
			<main
				onClick={function () {
					calls.push("main")
				}}
			>
				<div
					onClick={function (event) {
						expect(event.target).not.toBe(event.currentTarget)
						expect((event.target as HTMLElement).getAttribute("data-action")).toBe("save")
						calls.push(event.currentTarget.tagName)
						event.stopPropagation()
						send("saved")
					}}
				>
					<button data-action="save">Go</button>
				</div>
				<p>{App.useModel()}</p>
			</main>
		)
	}
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given(""),
		Scene.click(Scene.role("button")),
		Scene.expect(Scene.text("saved")).toExist()
	)
	expect(calls).toEqual(["DIV"])
})

it("typing invokes a React text input's onChange", function () {
	function View() {
		const send = App.useDispatch()
		return (
			<input
				value={App.useModel()}
				onChange={(e) => send(e.target.value)}
			/>
		)
	}
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given(""),
		Scene.type(Scene.role("textbox"), "Ada"),
		Scene.expect(Scene.role("textbox")).toHaveValue("Ada")
	)
})

it("a mount effect can dispatch a message", function () {
	function View() {
		const send = App.useDispatch()
		React.useEffect(
			function markReady() {
				send("ready")
			},
			[send]
		)
		return <p>{App.useModel()}</p>
	}
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given("waiting"),
		Scene.expect(Scene.text("ready")).toExist()
	)
})

it("checkbox currentTarget.checked reflects the toggle", function () {
	function View() {
		const send = App.useDispatch()
		return (
			<input
				type="checkbox"
				name="agreement"
				checked={App.useModel() === "yes"}
				onChange={function (event) {
					expect(event.target).toBe(event.currentTarget)
					expect(event.target.type).toBe("checkbox")
					expect(event.target.name).toBe("agreement")
					send(event.currentTarget.checked ? "yes" : "no")
				}}
			/>
		)
	}
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given("no"),
		Scene.click(Scene.role("checkbox")),
		Scene.expect(Scene.role("checkbox")).toBeChecked()
	)
})

it("a bubbled click retains its original target", function () {
	function View() {
		const send = App.useDispatch()
		return (
			<main>
				<div onClick={(e) => send((e.target as HTMLElement).tagName)}>
					<button>Go</button>
				</div>
				<p>{App.useModel()}</p>
			</main>
		)
	}
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given(""),
		Scene.click(Scene.role("button")),
		Scene.expect(Scene.text("BUTTON")).toExist()
	)
})

it("a mount effect's local state update is visible", function () {
	function View() {
		const [ready, setReady] = React.useState(false)
		React.useEffect(function markReady() {
			setReady(true)
		}, [])
		return <p>{ready ? "ready" : "waiting"}</p>
	}
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given(""),
		Scene.expect(Scene.text("ready")).toExist()
	)
})

it("notifies memoized Submodel readers when the parent changes", function () {
	const Child = Submodel.define({ Model: Schema.String, Message: Schema.String })
	const lift = { read: (model: string) => model, toParentMessage: (message: string) => message }
	function ChildView() {
		return <p>{Child.useModel()}</p>
	}
	const MemoChildView = React.memo(ChildView)
	function View() {
		const send = App.useDispatch()
		return (
			<main>
				<button onClick={() => send("updated")}>Go</button>
				<Child.Provider
					from={App}
					lift={lift}
				>
					<MemoChildView />
				</Child.Provider>
			</main>
		)
	}
	Scene.scene(
		{ update, view: bindSceneView(App, View) },
		Scene.given("initial"),
		Scene.click(Scene.role("button")),
		Scene.expect(Scene.text("updated")).toExist()
	)
})

it("keeps Commands pending while effects deliver more messages within the same step", function () {
	const Message = defineMessageUnion({ Load: {}, Visible: {}, Loaded: {} })
	const Load = Command.define("LoadDuringEffect", {
		messages: [Message.Loaded],
		execute: Effect.succeed(Message.Loaded()),
	})
	const updateEffect = (_model: string, message: typeof Message.Type) =>
		message._tag === "Load"
			? { model: "loading", commands: [Load()] }
			: { model: message._tag === "Visible" ? "visible" : "ready" }
	const EffectApp = Application.define({ Model: Schema.String, Message, update: updateEffect })
	function View() {
		const model = EffectApp.useModel()
		const send = EffectApp.useSend()
		React.useEffect(
			function showLoading() {
				if (model === "loading") send.Visible()
			},
			[model, send]
		)
		return (
			<main>
				<button onClick={() => send.Load()}>Load</button>
				<p>{model}</p>
			</main>
		)
	}
	Scene.scene(
		{ update: updateEffect, view: bindSceneView(EffectApp, View) },
		Scene.given("idle"),
		Scene.click(Scene.role("button")),
		Scene.expect(Scene.text("visible")).toExist(),
		Scene.Command.expectExact(Load()),
		Scene.Command.resolve(Load, Message.Loaded()),
		Scene.expect(Scene.text("ready")).toExist()
	)
	function WithoutEffect() {
		const send = EffectApp.useSend()
		return <button onClick={() => send.Load()}>Load</button>
	}
	expect(() =>
		Scene.scene(
			{ update: updateEffect, view: bindSceneView(EffectApp, WithoutEffect) },
			Scene.given("idle"),
			Scene.click(Scene.role("button")),
			Scene.Subscription.emit(Message.Visible())
		)
	).toThrow(/unresolved Commands/)
})
