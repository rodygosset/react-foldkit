import { Array, Option, Schema } from "effect"
import React from "react"
import { defineApplication, type CommitEntry, type CommitSourceOptions } from "../../src/react"
import { modifyFields } from "../../src/struct"
import * as Update from "../../src/update"
import { fakeSource, Message } from "./commit-source"

const Model = Schema.Struct({ values: Schema.Array(Schema.String), edits: Schema.Number })
type Model = typeof Model.Type

export function createSourceFixture(
	initialSnapshot: ReadonlyArray<CommitEntry<Message>>,
	source = fakeSource(initialSnapshot),
	bootstrap: "hook" | "provider" = "hook"
) {
	const handled: Message[] = []
	const renders: Model[] = []
	const update = (model: Model, message: Message): Update.Return<Model, Message> => {
		handled.push(message)
		return Message.match(message, {
			Received: ({ value }) => ({
				model: modifyFields(model, { values: (values) => Array.append(values, value) }),
			}),
			Edited: () => ({ model: modifyFields(model, { edits: (edits) => edits + 1 }) }),
		})
	}
	const initial: Model = { values: [], edits: 0 }
	const init =
		bootstrap === "provider"
			? { model: initial }
			: Update.combine(
					initial,
					initialSnapshot.map(
						({ message }) =>
							(model: Model) =>
								update(model, message)
					)
				)
	const App = defineApplication({ Model, update })
	let dispatch: Option.Option<(message: Message) => void> = Option.none()
	function Connection(options: CommitSourceOptions<Message>) {
		App.useCommitSource(options)
		return null
	}
	function View() {
		const model = App.useModel()
		renders.push(model)
		dispatch = Option.some(App.useDispatch())
		return <span>{model.values.join(",")}</span>
	}
	function Tree({
		visible = true,
		baseline = initialSnapshot,
	}: {
		readonly visible?: boolean
		readonly baseline?: ReadonlyArray<CommitEntry<Message>>
	}) {
		if (bootstrap === "provider")
			return (
				<React.Activity mode={visible ? "visible" : "hidden"}>
					<App.Provider
						init={init}
						commitSource={source.source}
					>
						<View />
					</App.Provider>
				</React.Activity>
			)

		return (
			<App.Provider init={init}>
				<React.Activity mode={visible ? "visible" : "hidden"}>
					<Connection
						source={source.source}
						initialSnapshot={baseline}
					/>
				</React.Activity>
				<View />
			</App.Provider>
		)
	}
	return {
		App,
		Tree,
		View,
		init,
		source,
		handled,
		renders,
		dispatch: (message: Message) => Option.getOrThrow(dispatch)(message),
		get model() {
			return Option.getOrThrow(Array.last(renders))
		},
	}
}
