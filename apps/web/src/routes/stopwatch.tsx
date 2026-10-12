import { createFileRoute } from "@tanstack/react-router"
import { Stopwatch } from "../examples/stopwatch"

export const Route = createFileRoute("/stopwatch")({ component: Stopwatch })
