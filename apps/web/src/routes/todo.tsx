import { createFileRoute } from "@tanstack/react-router"
import { Schema } from "effect"
import { Todo } from "../examples/todo"
import { TodoSearch } from "../examples/todo/todo-search"

export const Route = createFileRoute("/todo")({
	validateSearch: TodoSearch.pipe(Schema.toStandardSchemaV1),
	component: Todo,
})
