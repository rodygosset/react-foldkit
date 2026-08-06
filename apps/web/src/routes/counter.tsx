import { createFileRoute } from "@tanstack/react-router"
import { Counter } from "../examples/counter"

export const Route = createFileRoute("/counter")({ component: Counter })
