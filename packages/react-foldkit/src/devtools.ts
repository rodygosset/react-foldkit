import type { DevToolsOverlay } from "foldkit/devtools-host"
import { makeObserver } from "./devToolsIntegration"
import { configure, type Hot } from "./devtoolsOverlay"
import * as DevToolsHost from "./internal/devToolsHost"

/**
 * Registers the DevTools recorder, Foldkit's native overlay, and the Vite HMR relay. The React
 * Foldkit Vite plugin calls it from an injected module, the way Foldkit's plugin calls
 * `__setDevToolsOverlay`. Applications that never import this entry ship no DevTools code.
 * Returns a function that removes the registration.
 *
 * @category configuration
 * @since 0.2.0
 * @internal
 */
export function __configure(overlay: DevToolsOverlay, hot: Hot | undefined): () => void {
	const unregister = DevToolsHost.register(makeObserver)
	const unconfigure = configure(overlay, hot)
	return function () {
		unconfigure()
		unregister()
	}
}
