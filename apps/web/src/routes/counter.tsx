import { createFileRoute } from "@tanstack/react-router"
import { Counter } from "../counter"

export const Route = createFileRoute("/counter")({ component: CounterPage })

function CounterPage() {
	return <Counter />
}
