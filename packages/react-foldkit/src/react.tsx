import { Equal } from "effect"
import React from "react"
import * as Store from "./store"
import type * as Update from "./update"

/**
 * Builds React bindings for a store config. The Provider boots the store in
 * `useEffect` (Strict Mode–safe), then children subscribe and dispatch.
 *
 * The underlying {@link Store.boot} matches Foldkit’s command loop: cached
 * Layer, interrupt registry, microtask scheduler + deferred forks, boot
 * barrier, drain budget, model-gated Subscriptions, and Scope teardown on
 * dispose.
 */
export function make<Model, Message, R = never>(config: Store.Config<Model, Message, R>) {
	const StoreContext = React.createContext<Store.Store<Model, Message> | null>(null)

	function useStore() {
		const value = React.useContext(StoreContext)
		if (value === null) throw new Error("react-foldkit hooks must be used within a <Provider>")

		return value
	}

	function Provider(props: { init: Update.Return<Model, Message, R>; children: React.ReactNode }) {
		// Capture mount init only — parent remounts via `key` when Flags change.
		const initRef = React.useRef(props.init)
		const [store, setStore] = React.useState<Store.Store<Model, Message> | null>(null)

		React.useEffect(function manageStoreLifetime() {
			// Boot in the effect so React Strict Mode's setup → cleanup → setup
			// cycle disposes the first store and leaves a live second one. Booting
			// during render + disposing in cleanup leaves Context pointing at a
			// disposed store (init Commands complete as no-ops → stuck "loading").
			const active = Store.boot(config, initRef.current)
			setStore(active)
			return function dispose() {
				active.dispose()
			}
		}, [])

		if (store === null) return null

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

		function getSnapshot(): Model | Selected {
			const model = store.getModel()
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

		return React.useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot)
	}

	return { Provider, useModel, useDispatch }
}
