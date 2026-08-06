import { Equal, Schema } from "effect"
import React from "react"
import * as ReactStore from "./internal/react-store"
import * as Store from "./store"
import type * as Update from "./update"

/**
 * Builds React bindings for a store config. The Provider creates a cold store
 * during render, then activates Commands and Subscriptions in `useEffect`.
 *
 * The underlying {@link Store.boot} matches Foldkit’s command loop: cached
 * Layer, interrupt registry, microtask scheduler + deferred forks, boot
 * barrier, drain budget, model-gated Subscriptions, and Scope teardown on
 * dispose.
 */
export function make<ModelSchema extends Schema.Codec<unknown, unknown, never, never>, Message, R = never>(
	config: Store.Config<ModelSchema, Message, R>
) {
	type Model = Schema.Schema.Type<ModelSchema>

	const StoreContext = React.createContext<ReactStore.ReactStore<Model, Message> | null>(null)

	function useStore() {
		const value = React.useContext(StoreContext)
		if (value === null) throw new Error("react-foldkit hooks must be used within a <Provider>")

		return value
	}

	function Provider(props: { init: Update.Return<Model, Message, R>; children: React.ReactNode }) {
		const [store] = React.useState(() => ReactStore.make(config, props.init))

		React.useEffect(
			function manageStoreLifetime() {
				return store.activate()
			},
			[store]
		)

		return <StoreContext.Provider value={store}>{props.children}</StoreContext.Provider>
	}

	const useDispatch = () => useStore().dispatch

	function useModel(): Model
	function useModel<Selected>(
		selector: (model: Model) => Selected,
		isEqual?: (a: Selected, b: Selected) => boolean
	): Selected
	function useModel<Selected>(
		selector?: (model: Model) => Selected,
		isEqual?: (a: Selected, b: Selected) => boolean
	): Model | Selected {
		const store = useStore()
		const selectorRef = React.useRef(selector)
		const isEqualRef = React.useRef(isEqual)
		const selectedRef = React.useRef<Model | Selected>(undefined as never)
		const hasSelectedRef = React.useRef(false)

		selectorRef.current = selector
		isEqualRef.current = isEqual

		const getSnapshot = (): Model | Selected => selectModel(store.getModel())

		const getServerSnapshot = (): Model | Selected => selectModel(store.getServerModel())

		function selectModel(model: Model): Model | Selected {
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

	return { Provider, useModel, useDispatch }
}
