// Fake todo API client — in-memory Ref with a small delay to simulate network.

import { Context, Effect, Layer, Ref } from "effect"
import type { TodoItem } from "./model"

const initialTodos: readonly TodoItem[] = [
	{ id: 1, text: "Read the REE loop", done: true },
	{ id: 2, text: "Wire URL search into Messages", done: false },
	{ id: 3, text: "Keep views free of navigate()", done: false },
]

const networkDelay = Effect.sleep("180 millis")

const make = Effect.gen(function* () {
	const todoListRef = yield* Ref.make(initialTodos)

	const getTodos = networkDelay.pipe(Effect.andThen(Ref.get(todoListRef)))

	const updateTodos = (f: (todos: readonly TodoItem[]) => readonly TodoItem[]) =>
		networkDelay.pipe(Effect.andThen(Ref.updateAndGet(todoListRef, f)))

	return {
		getTodos,
		updateTodos,
	}
})

export class TodoRepository extends Context.Service<TodoRepository, Effect.Success<typeof make>>()("TodoRepository") {
	static readonly layer = Layer.effect(this, make)
}
