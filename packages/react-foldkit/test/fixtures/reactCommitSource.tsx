import { Array, Option, Schema } from "effect"
import React from "react"
import { defineApplication, type CommitEntry } from "../../src/react"
import { modifyFields } from "../../src/struct"
import * as Update from "../../src/update"
import { fakeSource, Message } from "./commitSource"

const Model = Schema.Struct({ values: Schema.Array(Schema.String), edits: Schema.Finite })
type Model = typeof Model.Type

export function createSourceFixture(
	initialSnapshot: ReadonlyArray<CommitEntry<Message>>,
	source = fakeSource(initialSnapshot)
) {
	const handled: Message[] = []
	const renders: Model[] = []
	function update(model: Model, message: Message): Update.Return<Model, Message> {
		handled.push(message)
		return Message.match(message, {
			Received: ({ value }) => ({
				model: modifyFields(model, { values: (values) => Array.append(values, value) }),
			}),
			Edited: () => ({ model: modifyFields(model, { edits: (edits) => edits + 1 }) }),
		})
	}
	const init: Update.Return<Model, Message> = { model: { values: [], edits: 0 } }
	const App = defineApplication({ Model, update })
	let dispatch: Option.Option<(message: Message) => void> = Option.none()
	function View() {
		const model = App.useModel()
		renders.push(model)
		dispatch = Option.some(App.useDispatch())
		return <span>{model.values.join(",")}</span>
	}
	function Tree({ visible = true }: { readonly visible?: boolean }) {
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
