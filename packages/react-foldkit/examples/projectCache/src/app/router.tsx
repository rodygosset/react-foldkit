import { createRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"

/** TanStack Start calls this factory separately for each server request. */
export const getRouter = () => createRouter({ routeTree, defaultPreload: "intent" })

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>
	}
}
