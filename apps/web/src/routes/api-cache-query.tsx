import { createFileRoute } from "@tanstack/react-router"
import { ApiCacheQuery } from "../examples/api-cache-query"

export const Route = createFileRoute("/api-cache-query")({ component: ApiCacheQuery })
