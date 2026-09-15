import { createFileRoute } from "@tanstack/react-router"
import { ApiCacheHttpApi } from "../examples/api-cache-http-api"

export const Route = createFileRoute("/api-cache-http-api")({ component: ApiCacheHttpApi })
