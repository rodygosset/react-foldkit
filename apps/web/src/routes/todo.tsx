import { createFileRoute } from "@tanstack/react-router"
import { Schema } from "effect"
import { Todo } from "../todo"
import { TodoSearch } from "../todo-search"

export const Route = createFileRoute("/todo")({
	validateSearch: TodoSearch.pipe(Schema.toStandardSchemaV1),
	component: TodoPage,
})

function TodoPage() {
	return <Todo />
}
