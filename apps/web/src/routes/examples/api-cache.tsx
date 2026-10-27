import { createFileRoute } from "@tanstack/react-router"
import { exampleHead } from "../../site/examples"
import { ApiCache } from "../../examples/api-cache"

export const Route = createFileRoute("/examples/api-cache")({
	head: () => exampleHead("api-cache"),
	component: ApiCache,
})
