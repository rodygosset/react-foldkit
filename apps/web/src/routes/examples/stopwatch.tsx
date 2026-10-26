import { createFileRoute } from "@tanstack/react-router"
import { exampleHead } from "../../site/examples"
import { Stopwatch } from "../../examples/stopwatch"

export const Route = createFileRoute("/examples/stopwatch")({
	head: () => exampleHead("stopwatch"),
	component: Stopwatch,
})
