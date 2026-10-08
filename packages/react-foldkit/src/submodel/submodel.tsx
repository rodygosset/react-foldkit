import { Option, Schema } from "effect"
import React from "react"
import { modelHooks, type ModelHooks } from "../react/react"
import type { ModelSource } from "../modelSource"

/**
 * React binding for a child Model owned by its parent, returned by `define`. Use
 * its Provider to give child views a lifted source without starting another Store.
 *
 * @category models
 * @since 0.1.0
 */
export interface Submodel<Model, Message> extends ModelHooks<Model, Message> {
	/**
	 * Supplies the parent-owned source to child hooks. Source changes are observed without
	 * acquiring services or starting Commands.
	 */
	readonly Provider: (props: {
		readonly source: ModelSource<Model, Message>
		readonly children?: React.ReactNode
	}) => React.ReactNode
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
 * import { defineMessageUnion } from "react-foldkit/message"
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

	function Provider({
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

	function useSource(): ModelSource<Model, Message> {
		return Option.getOrThrowWith(React.useContext(Context), () => new ProviderError({}))
	}

	function useOptionalSource() {
		return React.useContext(Context)
	}
	return { Provider, ...modelHooks(useSource, useOptionalSource) }
}
