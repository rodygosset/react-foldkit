import { createFileRoute } from "@tanstack/react-router"
import { ApiCache } from "../examples/api-cache"

export const Route = createFileRoute("/api-cache")({ component: ApiCache })
