import { createFileRoute } from "@tanstack/react-router"
import { exampleHead } from "../../site/examples"
import { Schema } from "effect"
import { Todo } from "../../examples/todo"
import { TodoSearch } from "../../examples/todo/model"

export const Route = createFileRoute("/examples/todo")({
	head: () => exampleHead("todo"),
	validateSearch: TodoSearch.pipe(Schema.toStandardSchemaV1),
	component: Todo,
})
