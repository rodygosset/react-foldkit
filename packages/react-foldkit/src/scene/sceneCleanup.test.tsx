import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import React from "react"
import { expect, it } from "vitest"
import * as Application from "../application"
import * as Scene from "./index"
import { bindSceneView } from "./react"

const Message = defineMessageUnion({ SetText: { text: Schema.String } })
const update = (_model: string, message: typeof Message.Type) => ({ model: message.text })
const App = Application.define({ Model: Schema.String, Message, update })

function HealthyView() {
	return <p>{App.useModel()}</p>
}

function assertHealthyScene(): void {
	Scene.scene(
		{ update, view: bindSceneView(App, HealthyView) },
		Scene.given("healthy"),
		Scene.expect(Scene.text("healthy")).toExist()
	)
}

it("retains the assertion and cleanup failures after completing every React cleanup", function () {
	const cleanupError = new Error("cleanup failed")
	const cleaned: string[] = []
	function View() {
		React.useEffect(() => function () {
			cleaned.push("first")
			throw cleanupError
		}, [])
		React.useEffect(() => function () {
			cleaned.push("second")
		}, [])
		return <p>ready</p>
	}
	let failure: unknown
	try {
		Scene.scene(
			{ update, view: bindSceneView(App, View) },
			Scene.given("ready"),
			Scene.expect(Scene.text("missing")).toExist()
		)
	} catch (error) {
		failure = error
	}
	expect(failure).toBeInstanceOf(AggregateError)
	if (!(failure instanceof AggregateError)) throw new Error("Expected both Scene failures")
	expect(failure.errors).toHaveLength(2)
	expect(failure.errors[0].message).toContain("missing")
	expect(failure.errors[1]).toBe(cleanupError)
	expect(cleaned).toEqual(["first", "second"])
	assertHealthyScene()
})

it("preserves the original assertion Error when cleanup succeeds", function () {
	const assertionError = new Error("assertion failed")
	let cleaned = false
	function View() {
		React.useEffect(() => function () {
			cleaned = true
		}, [])
		return <p>ready</p>
	}
	let failure: unknown
	try {
		Scene.scene(
			{ update, view: bindSceneView(App, View) },
			Scene.given("ready"),
			Scene.tap(function () {
				throw assertionError
			})
		)
	} catch (error) {
		failure = error
	}
	expect(failure).toBe(assertionError)
	expect(cleaned).toBe(true)
	assertHealthyScene()
})

it("preserves both original Errors when a custom assertion and cleanup fail", function () {
	const assertionError = new Error("assertion failed")
	const cleanupError = new Error("cleanup failed")
	function View() {
		React.useEffect(() => function () {
			throw cleanupError
		}, [])
		return <p>ready</p>
	}
	let failure: unknown
	try {
		Scene.scene(
			{ update, view: bindSceneView(App, View) },
			Scene.given("ready"),
			Scene.tap(function () {
				throw assertionError
			})
		)
	} catch (error) {
		failure = error
	}
	expect(failure).toBeInstanceOf(AggregateError)
	if (!(failure instanceof AggregateError)) throw new Error("Expected both Scene failures")
	expect(failure.errors).toHaveLength(2)
	expect(failure.errors[0]).toBe(assertionError)
	expect(failure.errors[1]).toBe(cleanupError)
	assertHealthyScene()
})

it.each([undefined, null, "assertion failed", { reason: "assertion failed" }])(
	"preserves the original thrown value %s when cleanup succeeds",
	function (assertionFailure) {
		const failures: unknown[] = []
		try {
			Scene.scene(
				{ update, view: bindSceneView(App, HealthyView) },
				Scene.given("ready"),
				Scene.tap(function () {
					throw assertionFailure
				})
			)
		} catch (error) {
			failures.push(error)
		}
		expect(failures).toHaveLength(1)
		expect(failures[0]).toBe(assertionFailure)
		assertHealthyScene()
	}
)

it("preserves a cleanup Error after a successful Scene and still runs later cleanups", function () {
	const cleanupError = new Error("cleanup failed")
	const cleaned: string[] = []
	function View() {
		React.useEffect(() => function () {
			cleaned.push("first")
			throw cleanupError
		}, [])
		React.useEffect(() => function () {
			cleaned.push("second")
		}, [])
		return <p>ready</p>
	}
	let failure: unknown
	try {
		Scene.scene(
			{ update, view: bindSceneView(App, View) },
			Scene.given("ready"),
			Scene.expect(Scene.text("ready")).toExist()
		)
	} catch (error) {
		failure = error
	}
	expect(failure).toBe(cleanupError)
	expect(cleaned).toEqual(["first", "second"])
	assertHealthyScene()
})
