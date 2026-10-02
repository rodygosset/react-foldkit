// Check the built public API using Foldkit's Vitest type-test convention.
import { Option, Schema } from "effect"
import type React from "react"
import { defineMessageUnion } from "react-foldkit/message"
import { defineApplication, defineSubmodel, type ModelSource } from "react-foldkit/react"
import { describe, expectTypeOf, it } from "vitest"

const Model = Schema.Struct({ count: Schema.Number })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Load: {}, Loaded: { count: Schema.Number } })
type Message = typeof Message.Type

type ForeignMessage = { readonly _tag: "Other" }
const Submodel = defineSubmodel<Model, Message>()
const Root = defineApplication({ Model, update: (model: Model, _message: Message) => ({ model }) })
declare const dispatch: ReturnType<typeof Submodel.useDispatch>
declare const foreignDispatch: (message: ForeignMessage) => void

describe("defineSubmodel public types", () => {
	it("binds the hooks and Provider props to Model and Message through both exports", () => {
		expectTypeOf<keyof typeof Submodel>().toEqualTypeOf<
			"Provider" | "useModel" | "useDispatch" | "useSubmodel" | "useOptionalSubmodel" | "SubmodelProvider"
		>()
		expectTypeOf(Submodel.useModel).toEqualTypeOf<typeof Root.useModel>()
		expectTypeOf(Submodel.useDispatch).returns.toEqualTypeOf<(message: Message) => void>()
		expectTypeOf<React.ComponentProps<typeof Submodel.Provider>>().toEqualTypeOf<{
			readonly source: ModelSource<Model, Message>
			readonly children?: React.ReactNode
		}>()
	})

	if (false) {
		const model = Submodel.useModel()
		expectTypeOf(model).toEqualTypeOf<Model>()
		const count = Submodel.useModel((model) => model.count)
		expectTypeOf(count).toEqualTypeOf<number>()
		const label = Submodel.useModel(
			(model) => ({ text: String(model.count) }),
			(left, right) => left.text === right.text
		)
		expectTypeOf(label).toEqualTypeOf<{ text: string }>()
		// @ts-expect-error Selectors must accept the child's Model.
		Submodel.useModel((model: { other: string }) => model.other)
		Submodel.useModel(
			// @ts-expect-error A string comparator cannot compare a number selection.
			(model) => model.count,
			(left: string, right: string) => left === right
		)
		// @ts-expect-error Child dispatch only accepts its declared Messages.
		dispatch({ _tag: "Other" })
		const source = Root.useSubmodel({ read: (model) => model, toParentMessage: (message: Message) => message })
		expectTypeOf(source).toEqualTypeOf<ModelSource<Model, Message>>()
		Submodel.Provider({ source })
		Root.SubmodelProvider({
			projection: { read: model => model, toParentMessage: (message: Message) => message },
			render: ({ source }) => {
				expectTypeOf(source).toEqualTypeOf<ModelSource<Model, Message>>()
				return Submodel.Provider({ source })
			},
		})
		Submodel.SubmodelProvider({
			projection: { read: model => model.count, toParentMessage: (_message: string) => Message.Load() },
			render: ({ source }) => {
				expectTypeOf(source).toEqualTypeOf<ModelSource<number, string>>()
				return null
			},
		})
		Root.SubmodelProvider({
			projection: { read: model => model, toParentMessage: (message: Message) => message },
			// @ts-expect-error Render receives only source; children are closed over.
			render: ({ children }) => children,
		})
		const optional = Submodel.useOptionalSubmodel({
			read: (model) => Option.some(model.count),
			toParentMessage: (message: Message) => message,
		})
		expectTypeOf(optional).toEqualTypeOf<Option.Option<ModelSource<number, Message>>>()
		// @ts-expect-error The Provider source must match the child Model.
		Submodel.Provider({ source: { ...source, getSnapshot: () => "bad" } })
		// @ts-expect-error The source dispatcher must accept the child's Messages.
		Submodel.Provider({ source: { ...source, dispatch: foreignDispatch } })
		// @ts-expect-error A child Provider requires a source, not root-store init.
		Submodel.Provider({ init: { model: { count: 1 } } })
		Root.useSubmodel({
			// @ts-expect-error Parent readers cannot read a foreign Model.
			read: (model: { other: string }) => model.other,
			toParentMessage: (message: Message) => message,
		})
		// @ts-expect-error Message lifting must return a parent Message.
		Root.useSubmodel({ read: (model) => model, toParentMessage: (_message: Message) => ({ _tag: "Other" }) })
		// @ts-expect-error Optional projections must describe presence explicitly.
		Root.useOptionalSubmodel({ read: (model) => model, toParentMessage: (message: Message) => message })
		// @ts-expect-error The factory accepts no runtime configuration.
		defineSubmodel<Model, Message>({ Model, Message })
	}
})
