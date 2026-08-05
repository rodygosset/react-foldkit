import { createFileRoute } from "@tanstack/react-router"
import { Stopwatch } from "../stopwatch"

export const Route = createFileRoute("/stopwatch")({ component: Stopwatch })
