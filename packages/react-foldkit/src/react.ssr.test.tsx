// @vitest-environment node
import { Effect, Layer, Option, Schema, Stream } from "effect"
import type * as Command from "foldkit/command"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"
import * as Subscription from "foldkit/subscription"
import type * as Update from "foldkit/update"
import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"
import * as Application from "./application"
import * as Engine from "../test/fixtures/managedResource"

const Message = defineMessageUnion({
	CompletedLoad: { value: Schema.String },
})
type Message = typeof Message.Type

const Model = Schema.Struct({ status: Schema.String, value: Schema.String })
type Model = typeof Model.Type

type UpdateReturn = Update.Return<Model, Message>

const update = (model: Model, message: Message): UpdateReturn =>
	Message.match<UpdateReturn>(message, {
		CompletedLoad: ({ value }) => ({ model: modifyFields(model, { status: () => "Success", value: () => value }) }),
	})

describe("React server rendering", function () {
	it("renders the init Model without starting Commands, Subscriptions, or Layer resources", function () {
		let commandRuns = 0
		let subscriptionRuns = 0
		let layerBuilds = 0
		const command: Command.Command<Message> = {
			name: "Load",
			effect: Effect.sync(function () {
				commandRuns += 1
				return Message.CompletedLoad({ value: "loaded" })
			}),
		}
		const subscriptions = Subscription.make<Model, Message>()((entry) => ({
			observe: entry(
				{ status: Schema.String },
				{
					modelToDependencies: (model) => ({ status: model.status }),
					dependenciesToStream: () =>
						Stream.fromEffect(
							Effect.sync(function () {
								subscriptionRuns += 1
								return Message.CompletedLoad({ value: "subscription" })
							})
						),
				}
			),
		}))
		const layer = Layer.effectDiscard(
			Effect.sync(function () {
				layerBuilds += 1
			})
		)
		const { Provider, useModel } = Application.define(
			{ Model, Message, update, subscriptions },
			{
				resources: layer,
			}
		)

		function View() {
			const status = useModel((model) => model.status)
			return <span>{status}</span>
		}

		const html = renderToString(
			<Provider init={{ model: { status: "Loading", value: "" }, commands: [command] }}>
				<View />
			</Provider>
		)

		expect(html).toBe("<span>Loading</span>")
		expect(commandRuns).toBe(0)
		expect(subscriptionRuns).toBe(0)
		expect(layerBuilds).toBe(0)
	})

	it("isolates preloaded Models across server renders of the same app definition", function () {
		const { Provider, useModel } = Application.define({ Model, Message, update })
		function View() {
			const model = useModel()
			return <span>{`${model.status}:${model.value}`}</span>
		}
		const responses = ["first request", "second request"].map((value) =>
			renderToString(
				<Provider init={{ model: { status: "Success", value } }}>
					<View />
				</Provider>
			)
		)
		expect(responses).toEqual(["<span>Success:first request</span>", "<span>Success:second request</span>"])
	})
})

it("does not acquire managed resources while rendering on the server", function () {
	let acquisitions = 0
	const program = Engine.make(
		(id) =>
			Effect.sync(function () {
				acquisitions += 1
				return { id }
			}),
		undefined,
		Option.some("a")
	)
	const App = Application.define(program)
	const html = renderToString(
		<App.Provider>
			<span>Ready</span>
		</App.Provider>
	)
	expect(html).toContain("Ready")
	expect(acquisitions).toBe(0)
})
