import { Equal, Schema } from "effect"
import React from "react"
import * as ReactStore from "./internal/react-store"
import * as Store from "./store"
import type * as Update from "./update"

export type Config<ModelSchema extends Schema.Codec<unknown, unknown, never, never>, Message, R = never> =
	Store.Config<Schema.Schema.Type<ModelSchema>, Message, R> & {
		readonly Model: ModelSchema
	}

type Type<ModelSchema extends Schema.Codec<unknown, unknown, never, never>> = Schema.Schema.Type<ModelSchema>

/**
 * Builds Provider, Seed, and hooks around a Foldkit-shaped store.
 *
 * Provider cold-boots from `init` and disposes on unmount. Seed writes a Model
 * into the inactive store (before activate) so SSR and first paint see
 * preloaded data. Live updates go through dispatch after activate.
 */
export function make<ModelSchema extends Schema.Codec<unknown, unknown, never, never>, Message, R = never>({
	Model,
	...rest
}: Config<ModelSchema, Message, R>) {
	const config = Store.Config.make(rest)
	const equalsModel = Schema.toEquivalence(Model)
	const StoreContext = React.createContext<ReactStore.ReactStore<Type<ModelSchema>, Message> | null>(null)

	function useStore() {
		const value = React.useContext(StoreContext)
		if (value === null) throw new Error("react-foldkit hooks must be used within a <Provider>")

		return value
	}

	type ProviderProps = {
		readonly init: Update.Return<Type<ModelSchema>, Message, R>
		readonly children: React.ReactNode
	}

	function Provider(props: ProviderProps) {
		const [store] = React.useState(() => ReactStore.make(config, props.init))

		React.useEffect(
			function manageStoreLifetime() {
				return store.activate()
			},
			[store]
		)

		return <StoreContext.Provider value={store}>{props.children}</StoreContext.Provider>
	}

	function Seed(props: { readonly model: Type<ModelSchema>; readonly children?: React.ReactNode }): React.ReactNode {
		const store = useStore()
		const appliedModelRef = React.useRef<Type<ModelSchema> | null>(null)

		if (appliedModelRef.current === null || !equalsModel(appliedModelRef.current, props.model)) {
			appliedModelRef.current = props.model
			store.seed(props.model)
		}

		return props.children ?? null
	}

	const useDispatch = () => useStore().dispatch

	function useModel(): Type<ModelSchema>
	function useModel<Selected>(
		selector: (model: Type<ModelSchema>) => Selected,
		isEqual?: (a: Selected, b: Selected) => boolean
	): Selected
	function useModel<Selected>(
		selector?: (model: Type<ModelSchema>) => Selected,
		isEqual?: (a: Selected, b: Selected) => boolean
	): Type<ModelSchema> | Selected {
		const store = useStore()
		const selectorRef = React.useRef(selector)
		const isEqualRef = React.useRef(isEqual)
		const selectedRef = React.useRef<Type<ModelSchema> | Selected>(undefined as never)
		const hasSelectedRef = React.useRef(false)

		selectorRef.current = selector
		isEqualRef.current = isEqual

		const getSnapshot = (): Type<ModelSchema> | Selected => selectModel(store.getModel())

		const getServerSnapshot = (): Type<ModelSchema> | Selected => selectModel(store.getServerModel())

		function selectModel(model: Type<ModelSchema>): Type<ModelSchema> | Selected {
			const currentSelector = selectorRef.current
			if (currentSelector === undefined) return model

			const next = currentSelector(model)
			if (hasSelectedRef.current) {
				const equals = isEqualRef.current ?? Equal.equals
				if (equals(selectedRef.current as Selected, next)) return selectedRef.current
			}
			hasSelectedRef.current = true
			selectedRef.current = next
			return next
		}

		return React.useSyncExternalStore(store.subscribe, getSnapshot, getServerSnapshot)
	}

	return { Provider, Seed, useModel, useDispatch }
}
