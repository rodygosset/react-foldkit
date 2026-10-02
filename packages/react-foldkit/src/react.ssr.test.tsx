// @vitest-environment node
import { Effect, Layer, Schema, Stream } from "effect"
import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type * as Command from "./command"
import { defineMessageUnion } from "./message"
import { defineApplication } from "./react"
import { modifyFields } from "./struct"
import * as Subscription from "./subscription"
import type * as Update from "./update"

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
		const subscriptions = Subscription.make<Model, Message>()(function (entry) {
			return {
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
			}
		})
		const layer = Layer.effectDiscard(
			Effect.sync(function () {
				layerBuilds += 1
			})
		)
		const { Provider, useModel } = defineApplication({ Model, update, subscriptions, layer })

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

	it("isolates preloaded Models across server renders of the same app definition", () => {
		const { Provider, useModel } = defineApplication({ Model, update })
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
