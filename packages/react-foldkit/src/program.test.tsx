import { act, cleanup, render, screen } from "@testing-library/react"
import { Effect, Result, Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"
import type * as Update from "foldkit/update"
import { afterEach, describe, expect, it } from "vitest"
import * as Application from "./application"
import * as Program from "./program"
import * as Store from "./store"
import { define } from "./submodel"

afterEach(cleanup)

const Model = Schema.Struct({ count: Schema.Finite })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ClickedIncrement: {} })
type Message = typeof Message.Type

const init = (): Update.Return<Model, Message> => ({ model: { count: 0 } })
const update = (model: Model, message: Message) =>
	Message.match<Update.Return<Model, Message>>(message, {
		ClickedIncrement: () => ({ model: modifyFields(model, { count: (count) => count + 1 }) }),
	})

const counter = Program.make({ Model, Message, init, update })

describe("Program.make", function () {
	it("returns the Program it was given", function () {
		const program = { Model, Message, init, update }
		expect(Program.make(program)).toBe(program)
	})

	it("runs in React through Application.define", function () {
		const App = Application.define(counter, { freezeModel: true })
		function View() {
			const send = App.useSend()
			return <button onClick={() => send.ClickedIncrement()}>{App.useModel((model) => model.count)}</button>
		}
		render(
			<App.Provider>
				<View />
			</App.Provider>
		)

		act(() => screen.getByRole("button").click())

		expect(screen.getByRole("button").textContent).toBe("1")
	})

	it("runs in a Store without React", function () {
		const store = Store.boot(counter, counter.init())
		expect(Result.isSuccess(store.commit(Message.ClickedIncrement()))).toBe(true)
		expect(store.getModel()).toEqual({ count: 1 })
		Effect.runSync(store.dispose())
	})

	it("binds a child Program with Submodel.define", function () {
		const OutMessage = defineMessageUnion({ Reached: { count: Schema.Finite } })
		const child = Program.make({
			Model,
			Message,
			OutMessage,
			update: (model: Model, _message: Message) => ({
				model,
				outMessage: OutMessage.Reached({ count: model.count }),
			}),
		})
		const Child = define(child)
		expect(typeof Child.useSend).toBe("function")
	})
})
