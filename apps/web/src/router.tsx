import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"

function createAppRouter() {
	return createTanStackRouter({
		routeTree,
		scrollRestoration: true,
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
	})
}

type AppRouter = ReturnType<typeof createAppRouter>

let router: AppRouter | undefined

/** Single router instance — Commands call `getRouter().navigate`, Links use the same tree. */
export function getRouter(): AppRouter {
	if (router === undefined) {
		router = createAppRouter()
	}
	return router
}

declare module "@tanstack/react-router" {
	interface Register {
		router: AppRouter
	}
}
