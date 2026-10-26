import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"

const createAppRouter = () =>
	createTanStackRouter({
		routeTree,
		scrollRestoration: true,
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
	})

type AppRouter = ReturnType<typeof createAppRouter>

let router: AppRouter | undefined

/**
 * One router in the browser, so Commands that call `getRouter().navigate` and Links share it.
 * The server builds a new router for each request, because prerendering runs requests at once.
 */
export function getRouter(): AppRouter {
	if (typeof window === "undefined") return createAppRouter()
	router ??= createAppRouter()
	return router
}

declare module "@tanstack/react-router" {
	interface Register {
		router: AppRouter
	}
}
