import { Option, Schema } from "effect"
import React from "react"
import { makeSourceContext, modelHooks, type ModelHooks } from "../application/react"
import type { ModelSource } from "../modelSource"
import type { OptionalProjection, Projection } from "./lift"

/**
 * Props for a Submodel Provider. Pass the parent hooks and a lift to derive the child source,
 * the parent hooks and an `optionalLift` for a child that may be absent, or a source you
 * already derived.
 *
 * @category configuration
 * @since 0.1.0
 */
export type ProviderProps<Model, Message, ParentModel = never, ParentMessage = never> = {
	readonly children?: React.ReactNode
} & (
	| {
			/**
			 * The parent application or Submodel whose Model holds this child.
			 */
			readonly from: Pick<ModelHooks<ParentModel, ParentMessage>, "useSubmodel">
			/**
			 * Reads the child from the parent Model and lifts its Messages. Declare it outside render.
			 */
			readonly lift: Projection<ParentModel, ParentMessage, Model, Message>
			readonly optionalLift?: never
			readonly fallback?: never
			readonly source?: never
	  }
	| {
			/**
			 * The parent application or Submodel whose Model may hold this child.
			 */
			readonly from: Pick<ModelHooks<ParentModel, ParentMessage>, "useOptionalSubmodel">
			/**
			 * Reads the child while the parent Model holds it and lifts its Messages. Declare it
			 * outside render.
			 */
			readonly optionalLift: OptionalProjection<ParentModel, ParentMessage, Model, Message>
			/**
			 * Rendered in place of the children while the child is absent. Defaults to nothing.
			 */
			readonly fallback?: React.ReactNode
			readonly lift?: never
			readonly source?: never
	  }
	| {
			/**
			 * A child source derived with `useSubmodel` or `useOptionalSubmodel`.
			 */
			readonly source: ModelSource<Model, Message>
			readonly from?: never
			readonly lift?: never
			readonly optionalLift?: never
			readonly fallback?: never
	  }
)

/**
 * React binding for a child Model owned by its parent, returned by `define`. Use
 * its Provider to give child views a lifted source without starting another Store.
 *
 * @category models
 * @since 0.1.0
 */
export interface Submodel<Model, Message> extends ModelHooks<Model, Message> {
	/**
	 * Supplies the parent-owned child to child hooks, from a parent and lift or optional lift, or
	 * from a source. It does not acquire services or start Commands.
	 */
	readonly Provider: <ParentModel = never, ParentMessage = never>(
		props: ProviderProps<Model, Message, ParentModel, ParentMessage>
	) => React.ReactNode
}

/**
 * Thrown when a required Submodel hook is called outside its matching Provider.
 *
 * @see {@link define} for the Provider and hooks that share a context
 * @category errors
 * @since 0.1.0
 */
export class ProviderError extends Schema.Error<ProviderError>("react-foldkit/Submodel/ProviderError")({
	_tag: Schema.tag("ProviderError"),
}) {
	get message(): string {
		return "Submodel hooks must be used within their matching <Provider>"
	}
}

/**
 * The child Model Schema and Message union that `define` binds. A child `Program` from
 * `Program.make` is one.
 *
 * @category configuration
 * @since 0.2.0
 */
export interface Config<Model, Message> {
	/**
	 * Supplies the child Model type. The Submodel Provider does not validate it.
	 */
	readonly Model: Schema.Codec<Model, unknown, unknown, unknown>
	/**
	 * The Schema of the Messages the child update handles, usually the union from
	 * `defineMessageUnion`. `useSend` builds Messages with its constructors.
	 */
	readonly Message: Schema.Schema<Message>
}

/**
 * Creates a child Provider and hooks for a parent-owned Model source.
 *
 * The Provider reads the child from a parent with `from` and `lift`, from a parent with `from`
 * and `optionalLift` while the child is present, or takes a `source` you already derived, and
 * forwards its snapshots and Messages. It does not create a Store, acquire services, or start
 * Commands. Required hooks throw `ProviderError` outside this Provider; optional hooks return
 * `None`.
 *
 * **Example** (Sharing a parent-owned counter with a child view)
 *
 * ```tsx
 * import { Schema } from "effect"
 * import { defineMessageUnion } from "foldkit/message"
 * import * as Submodel from "react-foldkit/submodel"
 *
 * export const Model = Schema.Struct({ count: Schema.Finite })
 * export type Model = typeof Model.Type
 *
 * export const Message = defineMessageUnion({ Incremented: {} })
 * export type Message = typeof Message.Type
 *
 * export const { Provider, useModel, useSend } = Submodel.define({ Model, Message })
 *
 * export function View() {
 * 	const count = useModel((model) => model.count)
 * 	const send = useSend()
 *
 * 	return <button onClick={() => send.Incremented()}>{count}</button>
 * }
 * ```
 *
 * @category constructors
 * @since 0.1.0
 */
export function define<Model, Message>(config: Config<Model, Message>): Submodel<Model, Message> {
	const Context = makeSourceContext<Model, Message>()

	function SourceProvider({
		source,
		children,
	}: {
		readonly source: ModelSource<Model, Message>
		readonly children?: React.ReactNode
	}) {
		const context = React.useMemo(
			() =>
				Option.some({
					getSnapshot: () => source.getSnapshot(),
					getServerSnapshot: () => source.getServerSnapshot(),
					subscribe: (notify: () => void) => source.subscribe(notify),
					dispatch: (message: Message) => source.dispatch(message),
				}),
			[source]
		)
		return <Context.Provider value={context}>{children}</Context.Provider>
	}

	function LiftedProvider<ParentModel, ParentMessage>({
		from,
		lift,
		children,
	}: {
		readonly from: Pick<ModelHooks<ParentModel, ParentMessage>, "useSubmodel">
		readonly lift: Projection<ParentModel, ParentMessage, Model, Message>
		readonly children?: React.ReactNode
	}) {
		return <SourceProvider source={from.useSubmodel(lift)}>{children}</SourceProvider>
	}

	function OptionalLiftedProvider<ParentModel, ParentMessage>({
		from,
		optionalLift,
		fallback = null,
		children,
	}: {
		readonly from: Pick<ModelHooks<ParentModel, ParentMessage>, "useOptionalSubmodel">
		readonly optionalLift: OptionalProjection<ParentModel, ParentMessage, Model, Message>
		readonly fallback?: React.ReactNode
		readonly children?: React.ReactNode
	}) {
		return Option.match(from.useOptionalSubmodel(optionalLift), {
			onNone: () => fallback,
			onSome: (source) => <SourceProvider source={source}>{children}</SourceProvider>,
		})
	}

	function Provider<ParentModel = never, ParentMessage = never>(
		props: ProviderProps<Model, Message, ParentModel, ParentMessage>
	) {
		if (props.source !== undefined) return <SourceProvider source={props.source}>{props.children}</SourceProvider>
		if (props.optionalLift !== undefined)
			return (
				<OptionalLiftedProvider
					from={props.from}
					optionalLift={props.optionalLift}
					fallback={props.fallback}
				>
					{props.children}
				</OptionalLiftedProvider>
			)
		return (
			<LiftedProvider
				from={props.from}
				lift={props.lift}
			>
				{props.children}
			</LiftedProvider>
		)
	}

	return { Provider, ...modelHooks(Context, config.Message, () => new ProviderError({})) }
}
