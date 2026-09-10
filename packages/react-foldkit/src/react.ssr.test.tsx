// @vitest-environment node

import { Effect, Layer, Schema, Stream } from "effect"
import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type * as Command from "./command"
import { defineMessageUnion } from "./message"
import { make } from "./react"
import * as Subscription from "./subscription"
import type * as Update from "./update"

const Message = defineMessageUnion({
	CompletedLoad: { value: Schema.String },
})
type Message = typeof Message.Type

const Model = Schema.Struct({ status: Schema.String, value: Schema.String })
type Model = typeof Model.Type

type UpdateReturn = Update.Return<Model, Message>

const update = (_model: Model, message: Message): UpdateReturn =>
	Message.match<UpdateReturn>(message, {
		CompletedLoad: ({ value }) => ({ model: { status: "Success", value } }),
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
		const { Provider, useModel } = make({ Model, config: { update, subscriptions, layer } })

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

	it("supports whole-Model and structurally selected server snapshots", function () {
		const { Provider, useModel } = make({ Model, config: { update } })

		function View() {
			const model = useModel()
			const selected = useModel((current) => ({ value: current.value }))
			return <span>{`${model.status}:${selected.value}`}</span>
		}

		const html = renderToString(
			<Provider init={{ model: { status: "Loading", value: "server" } }}>
				<View />
			</Provider>
		)

		expect(html).toBe("<span>Loading:server</span>")
	})

	it("Seed writes the Model into the server snapshot before paint", function () {
		const { Provider, Seed, useModel } = make({ Model, config: { update } })
		const seeded = { status: "Success", value: "preloaded" }

		function View() {
			const model = useModel()
			return <span>{`${model.status}:${model.value}`}</span>
		}

		const html = renderToString(
			<Provider init={{ model: { status: "Loading", value: "" } }}>
				<Seed model={seeded}>
					<View />
				</Seed>
			</Provider>
		)

		expect(html).toBe("<span>Success:preloaded</span>")
	})
})
