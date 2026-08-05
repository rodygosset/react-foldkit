import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"

type AppRouter = ReturnType<typeof createTanStackRouter>

let router: AppRouter | undefined

/** Single router instance — Commands call `getRouter().navigate`, Links use the same tree. */
export function getRouter(): AppRouter {
	if (router === undefined) {
		router = createTanStackRouter({
			routeTree,
			scrollRestoration: true,
			defaultPreload: "intent",
			defaultPreloadStaleTime: 0,
		})
	}
	return router
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>
	}
}
