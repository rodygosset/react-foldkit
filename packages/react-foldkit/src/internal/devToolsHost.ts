import type { makeObserver } from "../devToolsIntegration"

// Holds the DevTools recorder that `react-foldkit/devtools` registers, like Foldkit's
// `__setDevToolsOverlay`. Applications import only this module, so the recorder, the DevTools
// store, and the overlay stay out of bundles that never register them.

type MakeObserver = typeof makeObserver

let registered: MakeObserver | undefined

/** Registers the recorder and returns a function that removes it. */
export function register(recorder: MakeObserver): () => void {
	registered = recorder
	return function () {
		if (registered === recorder) registered = undefined
	}
}

/** The registered recorder, or `undefined` when no DevTools entry has registered one. */
export const recorder = (): MakeObserver | undefined => registered
