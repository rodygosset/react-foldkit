// Check the built public API using Foldkit's Vitest type-test convention.
import { Option, Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import { defineApplication } from "react-foldkit/react"
import { define } from "react-foldkit/submodel"
import type { ModelSource } from "react-foldkit/modelSource"
import { describe, expectTypeOf, it } from "vitest"

const Model = Schema.Struct({ count: Schema.Finite })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Load: {}, Loaded: { count: Schema.Finite } })
type Message = typeof Message.Type

type ForeignMessage = { readonly _tag: "Other" }
const Submodel = define({ Model, Message })
const Root = defineApplication({ Model, Message, update: (model: Model, _message: Message) => ({ model }) })
declare const dispatch: ReturnType<typeof Submodel.useDispatch>
declare const foreignDispatch: (message: ForeignMessage) => void

describe("define public types", function () {
	it("binds the hooks and Provider props to Model and Message through both exports", function () {
		expectTypeOf<keyof typeof Submodel>().toEqualTypeOf<
			| "Provider"
			| "useModel"
			| "useDispatch"
			| "useSend"
			| "useOptionalModel"
			| "useOptionalDispatch"
			| "useSubmodel"
			| "useOptionalSubmodel"
			| "useInbound"
		>()
		expectTypeOf(Submodel.useModel).toEqualTypeOf<typeof Root.useModel>()
		expectTypeOf(Submodel.useDispatch).returns.toEqualTypeOf<(message: Message) => void>()
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
		Submodel.Provider({
			from: Root,
			lift: { read: (model: Model) => model, toParentMessage: (message: Message) => message },
		})
		Submodel.Provider({
			from: Root,
			// @ts-expect-error The lift must produce this Submodel's Model.
			lift: { read: (model: Model) => model.count, toParentMessage: (message: Message) => message },
		})
		// @ts-expect-error A Provider takes a source or a parent and lift, not both.
		Submodel.Provider({
			source,
			from: Root,
			lift: { read: (model: Model) => model, toParentMessage: (message: Message) => message },
		})
		const optional = Submodel.useOptionalSubmodel({
			read: (model) => Option.some(model.count),
			toParentMessage: (message: Message) => message,
		})
		expectTypeOf(optional).toEqualTypeOf<Option.Option<ModelSource<number, Message>>>()
		const optionalChild = {
			read: (model: Model) => Option.some(model),
			toParentMessage: (message: Message) => message,
		}
		Submodel.Provider({ from: Root, optionalLift: optionalChild, fallback: null })
		Submodel.Provider({
			from: Root,
			// @ts-expect-error optionalLift reads an Option of the child Model.
			optionalLift: { read: (model: Model) => model, toParentMessage: (message: Message) => message },
		})
		// @ts-expect-error A Provider takes a lift or an optionalLift, not both.
		Submodel.Provider({
			from: Root,
			lift: { read: (model: Model) => model, toParentMessage: (message: Message) => message },
			optionalLift: optionalChild,
		})
		// @ts-expect-error fallback only applies to optionalLift.
		Submodel.Provider({ source, fallback: null })
		Submodel.useSend().Loaded({ count: 1 })
		// @ts-expect-error Child Send only has the child's tags.
		Submodel.useSend().Other()
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
		// @ts-expect-error The factory needs the child Model Schema and Message union.
		define<Model, Message>()
		// @ts-expect-error The Message union must match the child's Messages.
		define<Model, Message>({ Model, Message: defineMessageUnion({ Other: {} }) })
	}
})
