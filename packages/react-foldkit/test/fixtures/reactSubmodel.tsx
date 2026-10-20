import { Option, Schema } from "effect"
import React from "react"
import { defineMessageUnion } from "foldkit/message"
import type { ModelSource } from "../../src/modelSource"
import * as Application from "../../src/application"
import { modifyFields } from "foldkit/struct"
import { define } from "../../src/submodel"

export const ChildModel = Schema.Struct({ count: Schema.Finite, unrelated: Schema.Finite })
export type ChildModel = typeof ChildModel.Type
export const ChildMessage = defineMessageUnion({ Increment: {}, IncrementOther: {} })
export type ChildMessage = typeof ChildMessage.Type
const Model = Schema.Struct({ child: ChildModel, other: Schema.Finite })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Child: { message: ChildMessage }, Set: { child: ChildModel }, Other: {} })
type Message = typeof Message.Type

export function createSubmodelFixture() {
	const Child = define({ Model: ChildModel, Message: ChildMessage })
	const App = Application.define({
		Model,
		Message,
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
	const child = {
		read: (model: Model) => ({ ...model.child }),
		toParentMessage: (message: ChildMessage) => Message.Child({ message }),
	}
	let dispatch: Option.Option<ReturnType<typeof App.useDispatch>> = Option.none()
	let source: Option.Option<ModelSource<ChildModel, ChildMessage>> = Option.none()
	let parentRenders = 0
	let listeners = 0
	function Connection({ children }: { readonly children?: React.ReactNode }) {
		parentRenders += 1
		const projected = App.useSubmodel(child)
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
		dispatch = Option.some(App.useDispatch())
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
		lift: child,
		Child,
		Tree,
		set: (child: ChildModel) => Option.getOrThrow(dispatch)(Message.Set({ child })),
		other: () => Option.getOrThrow(dispatch)(Message.Other()),
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
