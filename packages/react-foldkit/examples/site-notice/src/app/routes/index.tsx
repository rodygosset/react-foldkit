import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import * as Home from "@/pages/home"

export const Route = createFileRoute("/")({
	loader: ({ abortController }) =>
		Effect.runPromise(Home.load(), {
			signal: abortController.signal,
		}),
	component: Home.View,
})
