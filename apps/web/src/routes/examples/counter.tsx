import { createFileRoute } from "@tanstack/react-router"
import { exampleHead } from "../../site/examples"
import { Counter } from "../../examples/counter"

export const Route = createFileRoute("/examples/counter")({
	head: () => exampleHead("counter"),
	component: Counter,
})
