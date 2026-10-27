import { createFileRoute } from "@tanstack/react-router"
import { exampleHead } from "../../site/examples"
import { ApiCacheQuery } from "../../examples/api-cache-query"

export const Route = createFileRoute("/examples/api-cache-query")({
	head: () => exampleHead("api-cache-query"),
	component: ApiCacheQuery,
})
