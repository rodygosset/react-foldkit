import { Effect, Schema } from "effect"
import * as Command from "foldkit/command"
import { defineMessageUnion } from "foldkit/message"
import type { HtmlBuilder } from "foldkit/html"
import * as FoldkitScene from "foldkit/scene"
import React from "react"
import { describe, expect as vitestExpect, it } from "vitest"
import * as Application from "../application"
import * as Scene from "./index"
import { bindSceneView } from "./react"

/**
 * Runs Foldkit Scene steps against a bound React view, one case per Scene feature family.
 * The agreed consumer example comes first, written exactly as it would read against
 * `foldkit/scene` after the view migrates.
 */

const Model = Schema.Struct({
	loading: Schema.Boolean,
	name: Schema.String,
	agreed: Schema.Boolean,
	query: Schema.String,
	keys: Schema.Array(Schema.String),
})
type Model = typeof Model.Type

const Message = defineMessageUnion({
	ClickedLoad: {},
	LoadedUser: { name: Schema.String },
	ToggledAgreement: {},
	ChangedQuery: { query: Schema.String },
	PressedKey: { key: Schema.String },
	SubmittedSearch: {},
	ClickedNothing: {},
})
type Message = typeof Message.Type

const OutMessage = defineMessageUnion({ Searched: { query: Schema.String } })
type OutMessage = typeof OutMessage.Type

const FetchUser = Command.define("FetchUser", {
	args: { userId: Schema.String },
	messages: [Message.LoadedUser],
	execute: () => Effect.succeed(Message.LoadedUser({ name: "Remote" })),
})

const initialModel: Model = { loading: false, name: "", agreed: false, query: "", keys: [] }

const update = (model: Model, message: Message) =>
	Message.match(message, {
		ClickedLoad: () => ({ model: { ...model, loading: true }, commands: [FetchUser({ userId: "42" })] }),
		LoadedUser: ({ name }) => ({ model: { ...model, loading: false, name } }),
		ToggledAgreement: () => ({ model: { ...model, agreed: !model.agreed } }),
		ChangedQuery: ({ query }) => ({ model: { ...model, query } }),
		PressedKey: ({ key }) => ({ model: { ...model, keys: [...model.keys, key] } }),
		SubmittedSearch: () => ({ model, outMessage: OutMessage.Searched({ query: model.query }) }),
		ClickedNothing: () => ({ model }),
	})

// The Scene update returns an OutMessage like a Submodel's; the Application only needs Model and Commands.
const App = Application.define({
	Model,
	Message,
	update(model: Model, message: Message) {
		const { model: nextModel, commands = [] } = update(model, message) as ReturnType<typeof update> & { commands?: ReadonlyArray<ReturnType<typeof FetchUser>> }
		return { model: nextModel, commands }
	},
})

function Profile() {
	const model = App.useModel()
	const send = App.useSend()

	return (
		<main>
			<button onClick={() => send.ClickedLoad()}>Load user</button>
			<p role="status">{model.loading ? "Loading" : model.name}</p>
			<input id="agree" type="checkbox" checked={model.agreed} onChange={() => send.ToggledAgreement()} />
			<label htmlFor="agree">Agree</label>
			<form
				aria-label="Search"
				onSubmit={function (event) {
					event.preventDefault()
					send.SubmittedSearch()
				}}
			>
				<input
					aria-label="Query"
					className={model.query === "" ? "empty" : "filled"}
					value={model.query}
					onChange={(event) => send.ChangedQuery({ query: event.target.value })}
					onKeyDown={(event) => send.PressedKey({ key: event.key })}
				/>
				<button type="submit" disabled={model.query === ""}>
					Search
				</button>
			</form>
			<ul>
				{model.keys.map((key, index) => (
					<li key={index}>{key}</li>
				))}
			</ul>
			<button
				onClick={function () {
					if (model.agreed) send.ClickedNothing()
				}}
			>
				Nothing
			</button>
			<p style={{ display: model.agreed ? "block" : "none", marginTop: 4 }}>Thanks</p>
		</main>
	)
}

const view = bindSceneView(App, Profile)

describe("Foldkit Scene compatibility for bound React views", function () {
	it("loads a user", function () {
		const { Command: SceneCommand, click, expect, given, role, scene } = Scene
		scene(
			{ update, view },
			given(initialModel),

			click(role("button", { name: "Load user" })),
			expect(role("status")).toHaveText("Loading"),

			SceneCommand.expectExact(FetchUser({ userId: "42" })),
			SceneCommand.resolve(FetchUser, Message.LoadedUser({ name: "Ada" })),

			expect(role("status")).toHaveText("Ada")
		)
	})

	it("fails the scene when a Command is left unresolved", function () {
		vitestExpect(() =>
			Scene.scene({ update, view }, Scene.given(initialModel), Scene.click(Scene.role("button", { name: "Load user" })))
		).toThrow(/FetchUser/)
	})

	it("supports element matchers on React host output", function () {
		Scene.scene(
			{ update, view },
			Scene.given(initialModel),
			Scene.expect(Scene.role("button", { name: "Search" })).toBeDisabled(),
			Scene.expect(Scene.role("textbox", { name: "Query" })).toHaveClass("empty"),
			Scene.expect(Scene.role("checkbox", { name: "Agree" })).not.toBeChecked(),
			Scene.click(Scene.role("checkbox", { name: "Agree" })),
			Scene.expect(Scene.role("checkbox", { name: "Agree" })).toBeChecked(),
			Scene.change(Scene.role("textbox", { name: "Query" }), "ada"),
			Scene.expect(Scene.role("textbox", { name: "Query" })).toHaveClass("filled"),
			Scene.expect(Scene.role("button", { name: "Search" })).not.toBeDisabled(),
			Scene.expect(Scene.role("textbox", { name: "Query" })).toHaveHandler("keydown"),
			Scene.expect(Scene.text("Thanks")).toHaveStyle("margin-top", "4px"),
			Scene.expect(Scene.text("Thanks")).toBeVisible(),
			Scene.expect(Scene.text("Missing")).toBeAbsent()
		)
	})

	it("delivers keyboard events and asserts collections", function () {
		Scene.scene(
			{ update, view },
			Scene.given(initialModel),
			Scene.keydown(Scene.role("textbox", { name: "Query" }), "Enter"),
			Scene.keydown(Scene.role("textbox", { name: "Query" }), "Escape"),
			Scene.expectAll(Scene.all.role("listitem")).toHaveCount(2),
			Scene.inside(Scene.role("list"), Scene.expect(Scene.text("Escape")).toExist())
		)
	})

	it("records OutMessages from a submitted form", function () {
		Scene.scene(
			{ update, view },
			Scene.given({ ...initialModel, query: "ada" }),
			Scene.submit(Scene.role("form", { name: "Search" })),
			Scene.expectOutMessage(OutMessage.Searched({ query: "ada" }))
		)
	})

	it("checks ignored interactions", function () {
		Scene.scene(
			{ update, view },
			Scene.given(initialModel),
			Scene.click(Scene.role("button", { name: "Nothing" })),
			Scene.expectIgnored(),
			Scene.expect(Scene.text("Thanks")).not.toBeVisible()
		)
	})
})

describe("Foldkit views through react-foldkit/scene", function () {
	it("runs a native Foldkit view with the upstream runner, including scoped steps", function () {
		const foldkitView = (model: Model, h: HtmlBuilder<Message>) =>
			h.main(
				[],
				[
					h.button([h.OnClick(Message.ClickedLoad())], ["Load user"]),
					h.ul([], model.keys.map((key) => h.li([], [key]))),
					h.p([h.Role("status")], [model.loading ? "Loading" : model.name]),
				]
			)
		Scene.scene(
			{ update, view: foldkitView },
			Scene.given({ ...initialModel, keys: ["Enter"] }),
			Scene.inside(Scene.role("list"), Scene.expect(Scene.text("Enter")).toExist()),
			Scene.click(Scene.role("button", { name: "Load user" })),
			Scene.Command.resolve(FetchUser, Message.LoadedUser({ name: "Ada" })),
			Scene.expect(Scene.role("status")).toHaveText("Ada")
		)
	})
})

describe("react-foldkit/scene entry", function () {
	it("exports the same runtime names as foldkit/scene, so migrating changes only the import", function () {
		vitestExpect(Object.keys(Scene).sort()).toEqual(Object.keys(FoldkitScene).sort())
	})
})
