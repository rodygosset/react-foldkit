import { Equal } from "effect"
import React from "react"
import type * as Update from "./update"
import * as Store from "./store"

/**
 * Builds React bindings for a store config. The Provider boots the store once
 * from the `init` prop (Flags / URL / loader data), then children subscribe
 * and dispatch as usual.
 */
export function make<Model, Message, R = never>(config: Store.Config<Model, Message, R>) {
	const StoreContext = React.createContext<Store.Store<Model, Message> | null>(null)

	function useStore() {
		const value = React.useContext(StoreContext)
		if (value === null) throw new Error("ree hooks must be used within a <Provider>")

		return value
	}

	function Provider(props: {
		init: Update.Return<Model, Message, R>
		children: React.ReactNode
	}) {
		const storeRef = React.useRef<Store.Store<Model, Message> | null>(null)
		if (storeRef.current === null) {
			storeRef.current = Store.boot(config, props.init)
		}

		React.useEffect(function disposeStoreOnUnmount() {
			return function dispose() {
				storeRef.current?.dispose()
				storeRef.current = null
			}
		}, [])

		return <StoreContext.Provider value={storeRef.current}>{props.children}</StoreContext.Provider>
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
