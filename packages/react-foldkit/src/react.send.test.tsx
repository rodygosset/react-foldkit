import { act, cleanup, render, screen } from "@testing-library/react"
import { Option, Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"
import type * as Update from "foldkit/update"
import { afterEach, describe, expect, it } from "vitest"
import * as Application from "./application"
import { define, lift } from "./submodel"

afterEach(cleanup)

const Model = Schema.Struct({ count: Schema.Finite, label: Schema.String })
type Model = typeof Model.Type

const Message = defineMessageUnion({
	ClickedIncrement: {},
	ChangedLabel: { label: Schema.String },
})
type Message = typeof Message.Type

describe("useSend", function () {
	it("builds Messages with the union constructors and dispatches built Messages", function () {
		const handled: Array<Message> = []
		const App = Application.define({
			Model,
			Message,
			update(model: Model, message: Message) {
				handled.push(message)
				return Message.match<Update.Return<Model, Message>>(message, {
					ClickedIncrement: () => ({ model: modifyFields(model, { count: (count) => count + 1 }) }),
					ChangedLabel: ({ label }) => ({ model: modifyFields(model, { label: () => label }) }),
				})
			},
		})
		let send: ReturnType<typeof App.useSend> | undefined
		function View() {
			send = App.useSend()
			return <span data-testid="model">{App.useModel((model) => `${model.label}:${model.count}`)}</span>
		}
		render(
			<App.Provider init={{ model: { count: 0, label: "a" } }}>
				<View />
			</App.Provider>
		)

		act(function () {
			send?.ClickedIncrement()
			send?.ChangedLabel({ label: "b" })
			send?.(Message.ClickedIncrement())
		})

		expect(screen.getByTestId("model").textContent).toBe("b:2")
		expect(handled).toEqual([
			Message.ClickedIncrement(),
			Message.ChangedLabel({ label: "b" }),
			Message.ClickedIncrement(),
		])
	})

	it("keeps its identity across renders", function () {
		const App = Application.define({
			Model,
			Message,
			update: (model: Model, _message: Message) => ({
				model: modifyFields(model, { count: (count) => count + 1 }),
			}),
		})
		const sends: Array<unknown> = []
		function View() {
			const send = App.useSend()
			sends.push(send)
			return <button onClick={() => send.ClickedIncrement()}>{App.useModel((model) => model.count)}</button>
		}
		render(
			<App.Provider init={{ model: { count: 0, label: "" } }}>
				<View />
			</App.Provider>
		)

		act(() => screen.getByRole("button").click())

		expect(screen.getByRole("button").textContent).toBe("1")
		expect(sends.length).toBeGreaterThan(1)
		expect(new Set(sends).size).toBe(1)
	})

	it("sends tags from nested and plain tagged Schemas", function () {
		const Inner = defineMessageUnion({ Loaded: { value: Schema.String } })
		const Outer = Schema.Union([Inner, Schema.TaggedStruct("Reset", {})])
		type Outer = typeof Outer.Type
		const handled: Array<Outer> = []
		const App = Application.define({
			Model: Schema.String,
			Message: Outer,
			update(model: string, message: Outer) {
				handled.push(message)
				return { model: message._tag === "Loaded" ? message.value : "" }
			},
		})
		let send: ReturnType<typeof App.useSend> | undefined
		function View() {
			send = App.useSend()
			return null
		}
		render(
			<App.Provider init={{ model: "" }}>
				<View />
			</App.Provider>
		)

		act(function () {
			send?.Loaded({ value: "x" })
			send?.Reset()
		})

		expect(handled).toEqual([{ _tag: "Loaded", value: "x" }, { _tag: "Reset" }])
	})

	it("routes Submodel sends through the lift to the parent", function () {
		const ChildModel = Schema.Struct({ draft: Schema.String })
		type ChildModel = typeof ChildModel.Type
		const ChildMessage = defineMessageUnion({ ChangedDraft: { text: Schema.String } })
		type ChildMessage = typeof ChildMessage.Type
		const ParentModel = Schema.Struct({ form: ChildModel })
		type ParentModel = typeof ParentModel.Type
		const ParentMessage = defineMessageUnion({ GotFormMessage: { message: ChildMessage } })
		type ParentMessage = typeof ParentMessage.Type

		const handled: Array<ParentMessage> = []
		const form = lift<ParentModel>()({
			field: "form",
			update: (model: ChildModel, { text }: ChildMessage) => ({
				model: modifyFields(model, { draft: () => text }),
			}),
			toParentMessage: (message: ChildMessage) => ParentMessage.GotFormMessage({ message }),
		})
		const App = Application.define({
			Model: ParentModel,
			Message: ParentMessage,
			update(model: ParentModel, message: ParentMessage) {
				handled.push(message)
				return form.fold(model, message.message)
			},
		})
		const Form = define({ Model: ChildModel, Message: ChildMessage })
		function FormView() {
			const send = Form.useSend()
			const draft = Form.useModel((model) => model.draft)
			return <button onClick={() => send.ChangedDraft({ text: "milk" })}>{draft || "empty"}</button>
		}
		render(
			<App.Provider init={{ model: { form: { draft: "" } } }}>
				<Form.Provider
					from={App}
					lift={form}
				>
					<FormView />
				</Form.Provider>
			</App.Provider>
		)

		act(() => screen.getByRole("button").click())

		expect(screen.getByRole("button").textContent).toBe("milk")
		expect(handled).toEqual([
			ParentMessage.GotFormMessage({ message: ChildMessage.ChangedDraft({ text: "milk" }) }),
		])
	})
})

describe("application init", function () {
	const App = Application.define({
		Model,
		Message,
		init: (): Update.Return<Model, Message> => ({ model: { count: 1, label: "config" } }),
		update: (model: Model, _message: Message) => ({ model }),
	})
	function View() {
		return <span data-testid="model">{App.useModel((model) => `${model.label}:${model.count}`)}</span>
	}

	it("starts from the config init when the Provider has no init", function () {
		render(
			<App.Provider>
				<View />
			</App.Provider>
		)
		expect(screen.getByTestId("model").textContent).toBe("config:1")
	})

	it("lets a Provider init replace the config init", function () {
		render(
			<App.Provider init={{ model: { count: 2, label: "prop" } }}>
				<View />
			</App.Provider>
		)
		expect(screen.getByTestId("model").textContent).toBe("prop:2")
	})
})

describe("optionalLift", function () {
	const EditorModel = Schema.Struct({ title: Schema.String })
	const EditorMessage = defineMessageUnion({ ChangedTitle: { title: Schema.String } })
	type EditorMessage = typeof EditorMessage.Type
	const ParentModel = Schema.Struct({ editing: Schema.Option(EditorModel) })
	type ParentModel = typeof ParentModel.Type
	const ParentMessage = defineMessageUnion({
		ClickedOpen: {},
		ClickedClose: {},
		GotEditorMessage: { message: EditorMessage },
	})
	type ParentMessage = typeof ParentMessage.Type

	const editing = {
		read: (model: ParentModel) => model.editing,
		toParentMessage: (message: EditorMessage) => ParentMessage.GotEditorMessage({ message }),
	}
	const Editor = define({ Model: EditorModel, Message: EditorMessage })

	it("renders the fallback while the child is absent and the children while it is present", function () {
		const handled: Array<ParentMessage> = []
		const App = Application.define({
			Model: ParentModel,
			Message: ParentMessage,
			update(model: ParentModel, message: ParentMessage) {
				handled.push(message)
				return ParentMessage.match<Update.Return<ParentModel, ParentMessage>>(message, {
					ClickedOpen: () => ({ model: { editing: Option.some({ title: "draft" }) } }),
					ClickedClose: () => ({ model: { editing: Option.none() } }),
					GotEditorMessage: () => ({ model }),
				})
			},
		})
		let send: ReturnType<typeof App.useSend> | undefined
		function Capture() {
			send = App.useSend()
			return null
		}
		function EditorView() {
			const send = Editor.useSend()
			const title = Editor.useModel((model) => model.title)
			return <button onClick={() => send.ChangedTitle({ title: "next" })}>{title}</button>
		}
		render(
			<App.Provider init={{ model: { editing: Option.none() } }}>
				<Capture />
				<Editor.Provider
					from={App}
					optionalLift={editing}
					fallback={<span>closed</span>}
				>
					<EditorView />
				</Editor.Provider>
			</App.Provider>
		)
		expect(screen.getByText("closed")).toBeTruthy()

		act(() => send?.ClickedOpen())
		expect(screen.getByRole("button").textContent).toBe("draft")

		act(() => screen.getByRole("button").click())
		expect(handled.at(-1)).toEqual(
			ParentMessage.GotEditorMessage({ message: EditorMessage.ChangedTitle({ title: "next" }) })
		)

		act(() => send?.ClickedClose())
		expect(screen.getByText("closed")).toBeTruthy()
		expect(screen.queryByRole("button")).toBeNull()
	})

	it("renders nothing while absent when no fallback is given", function () {
		const App = Application.define({
			Model: ParentModel,
			Message: ParentMessage,
			update: (model: ParentModel, _message: ParentMessage) => ({ model }),
		})
		const { container } = render(
			<App.Provider init={{ model: { editing: Option.none() } }}>
				<Editor.Provider
					from={App}
					optionalLift={editing}
				>
					<span>open</span>
				</Editor.Provider>
			</App.Provider>
		)
		expect(container.textContent).toBe("")
	})
})
