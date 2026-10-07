import { Option, Result, Schema } from "effect"
import React from "react"
import { modifyFields } from "../../src/struct"
import { defineMessageUnion } from "../../src/message"
import { defineApplication, defineSubmodel, defineSubmodelProjection, type ModelSource } from "../../src/react"

export const ChildModel = Schema.Struct({ count: Schema.Finite, unrelated: Schema.Finite })
export type ChildModel = typeof ChildModel.Type
export const ChildMessage = defineMessageUnion({ Increment: {}, IncrementOther: {} })
export type ChildMessage = typeof ChildMessage.Type
const Model = Schema.Struct({ child: ChildModel, other: Schema.Finite })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Child: { message: ChildMessage }, Set: { child: ChildModel }, Other: {} })
type Message = typeof Message.Type

export function createSubmodelFixture() {
	const Child = defineSubmodel<ChildModel, ChildMessage>()
	const App = defineApplication({
		Model,
		update: (model: Model, message: Message) =>
			Message.match(message, {
				Child: ({ message }) =>
					ChildMessage.match(message, {
						Increment: () => ({
							model: modifyFields(model, {
								child: (child) => modifyFields(child, { count: (count) => count + 1 }),
							}),
						}),
						IncrementOther: () => ({
							model: modifyFields(model, {
								child: (child) => modifyFields(child, { unrelated: (unrelated) => unrelated + 1 }),
							}),
						}),
					}),
				Set: ({ child }) => ({ model: modifyFields(model, { child: () => child }) }),
				Other: () => ({ model: modifyFields(model, { other: (other) => other + 1 }) }),
			}),
	})
	const projection = defineSubmodelProjection({
		read: (model: Model) => ({ ...model.child }),
		toParentMessage: (message: ChildMessage) => Message.Child({ message }),
	})
	let commit: Option.Option<ReturnType<typeof App.useCommit>> = Option.none()
	let source: Option.Option<ModelSource<ChildModel, ChildMessage>> = Option.none()
	let parentRenders = 0
	let listeners = 0
	function Connection({ children }: { readonly children?: React.ReactNode }) {
		parentRenders += 1
		const projected = App.useSubmodel(projection)
		const observed = React.useMemo<ModelSource<ChildModel, ChildMessage>>(
			() => ({
				...projected,
				subscribe(notify) {
					listeners += 1
					const unsubscribe = projected.subscribe(notify)
					return function () {
						listeners -= 1
						unsubscribe()
					}
				},
			}),
			[projected]
		)
		commit = Option.some(App.useCommit())
		source = Option.some(observed)
		return <Child.Provider source={observed}>{children}</Child.Provider>
	}
	function Tree({ children }: { readonly children?: React.ReactNode }) {
		return (
			<App.Provider init={{ model: { child: { count: 1, unrelated: 0 }, other: 0 } }}>
				<Connection>{children}</Connection>
			</App.Provider>
		)
	}
	return {
		App,
		projection,
		Child,
		Tree,
		set: (child: ChildModel) => Result.getOrThrow(Option.getOrThrow(commit)(Message.Set({ child }))),
		other: () => Result.getOrThrow(Option.getOrThrow(commit)(Message.Other())),
		get source() {
			return Option.getOrThrow(source)
		},
		get listeners() {
			return listeners
		},
		get parentRenders() {
			return parentRenders
		},
	}
}
