import { createFileRoute } from "@tanstack/react-router"
import { exampleHead } from "../../site/examples"
import { ApiCacheHttpApi } from "../../examples/api-cache-http-api"

export const Route = createFileRoute("/examples/api-cache-http-api")({
	head: () => exampleHead("api-cache-http-api"),
	component: ApiCacheHttpApi,
})
