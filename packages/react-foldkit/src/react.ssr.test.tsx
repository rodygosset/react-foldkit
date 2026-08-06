// @vitest-environment node

import { Effect, Layer, Match, Schema, Stream } from "effect"
import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type * as Command from "./command"
import { m } from "./message"
import { make } from "./react"
import * as Subscription from "./subscription"
import type * as Update from "./update"

const CompletedLoad = m("CompletedLoad", { value: Schema.String })
const Message = Schema.Union([CompletedLoad])
type Message = typeof Message.Type

const Model = Schema.Struct({ status: Schema.String, value: Schema.String })
type Model = typeof Model.Type

type UpdateReturn = Update.Return<Model, Message>

function update(_model: Model, message: Message): UpdateReturn {
	return Match.value(message).pipe(
		Match.withReturnType<UpdateReturn>(),
		Match.tagsExhaustive({
			CompletedLoad: function ({ value }) {
				return [{ status: "Success", value }, []]
			},
		})
	)
}

describe("React server rendering", function () {
	it("renders the init Model without starting Commands, Subscriptions, or Layer resources", function () {
		let commandRuns = 0
		let subscriptionRuns = 0
		let layerBuilds = 0
		const command: Command.Command<Message> = {
			name: "Load",
			effect: Effect.sync(function () {
				commandRuns += 1
				return CompletedLoad({ value: "loaded" })
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
									return CompletedLoad({ value: "subscription" })
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
		const { Provider, useModel } = make({ update, subscriptions, layer })

		function View() {
			const status = useModel((model) => model.status)
			return <span>{status}</span>
		}

		const html = renderToString(
			<Provider init={[{ status: "Loading", value: "" }, [command]]}>
				<View />
			</Provider>
		)

		expect(html).toBe("<span>Loading</span>")
		expect(commandRuns).toBe(0)
		expect(subscriptionRuns).toBe(0)
		expect(layerBuilds).toBe(0)
	})

	it("supports whole-Model and structurally selected server snapshots", function () {
		const { Provider, useModel } = make({ update })

		function View() {
			const model = useModel()
			const selected = useModel((current) => ({ value: current.value }))
			return <span>{`${model.status}:${selected.value}`}</span>
		}

		const html = renderToString(
			<Provider init={[{ status: "Loading", value: "server" }, []]}>
				<View />
			</Provider>
		)

		expect(html).toBe("<span>Loading:server</span>")
	})
})
