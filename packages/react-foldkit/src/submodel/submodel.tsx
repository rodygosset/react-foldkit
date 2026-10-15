import { Option, Schema } from "effect"
import React from "react"
import { modelHooks, type ModelHooks } from "../react/react"
import type { ModelSource } from "../modelSource"
import type { Lift } from "./lift"

/**
 * Props for a Submodel Provider. Pass the parent hooks and a lift to derive the child source,
 * or pass a source you already derived.
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
			readonly lift: Lift<ParentModel, ParentMessage, Model, Message>
			readonly source?: never
	  }
	| {
			/**
			 * A child source derived with `useSubmodel` or `useOptionalSubmodel`.
			 */
			readonly source: ModelSource<Model, Message>
			readonly from?: never
			readonly lift?: never
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
	 * Supplies the parent-owned child to child hooks, from a parent and lift or from a source.
	 * It does not acquire services or start Commands.
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
 * Creates a child Provider and hooks for a parent-owned Model source.
 *
 * The Provider forwards snapshots and Messages through its `source` prop. It does not create a
 * Store, acquire services, or start Commands. Required hooks throw `ProviderError`
 * outside this Provider; optional hooks return `None`.
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
 * export const { Provider, useModel } = Submodel.define<Model, Message>()
 *
 * export function View() {
 * 	const count = useModel((model) => model.count)
 *
 * 	return <span>{count}</span>
 * }
 * ```
 *
 * @category constructors
 * @since 0.1.0
 */
export function define<Model, Message>(): Submodel<Model, Message> {
	const Context = React.createContext<Option.Option<ModelSource<Model, Message>>>(Option.none())

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
		readonly lift: Lift<ParentModel, ParentMessage, Model, Message>
		readonly children?: React.ReactNode
	}) {
		return <SourceProvider source={from.useSubmodel(lift)}>{children}</SourceProvider>
	}

	function Provider<ParentModel = never, ParentMessage = never>(
		props: ProviderProps<Model, Message, ParentModel, ParentMessage>
	) {
		return props.source === undefined ? (
			<LiftedProvider from={props.from} lift={props.lift}>
				{props.children}
			</LiftedProvider>
		) : (
			<SourceProvider source={props.source}>{props.children}</SourceProvider>
		)
	}

	function useSource(): ModelSource<Model, Message> {
		return Option.getOrThrowWith(React.useContext(Context), () => new ProviderError({}))
	}

	function useOptionalSource() {
		return React.useContext(Context)
	}
	return { Provider, ...modelHooks(useSource, useOptionalSource) }
}
