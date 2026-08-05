/* eslint-disable @typescript-eslint/naming-convention */
import { getRouteApi, Link } from "@tanstack/react-router"
import * as Command from "@workspace/react-foldkit/command"
import { m } from "@workspace/react-foldkit/message"
import { make } from "@workspace/react-foldkit/react"
import * as Struct from "@workspace/react-foldkit/struct"
import * as Submodel from "@workspace/react-foldkit/submodel"
import type * as Update from "@workspace/react-foldkit/update"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Label } from "@workspace/ui/components/label"
import { Separator } from "@workspace/ui/components/separator"
import { Effect, Match, Schema } from "effect"
import { Trash2Icon } from "lucide-react"
import { ExampleShell } from "./components/example-shell"
import { getRouter } from "./router"
import * as TodoForm from "./todo-form"
import { Filter } from "./todo-search"
import { TodoItem } from "./todo/model"
import { TodoRepository } from "./todo/repository"

const todoRoute = getRouteApi("/todo")

const ItemsStatus = Schema.Literals(["loading", "ready", "failed"])
type ItemsStatus = typeof ItemsStatus.Type

const Model = Schema.Struct({
	form: TodoForm.Model,
	nextId: Schema.Number,
	items: Schema.Array(TodoItem),
	itemsStatus: ItemsStatus,
	filter: Filter,
})

type Model = typeof Model.Type

type Flags = {
	filter: Filter
}

const GotFormMessage = m("GotFormMessage", { message: TodoForm.Message })
const ToggledItem = m("ToggledItem", { id: Schema.Number })
const RemovedItem = m("RemovedItem", { id: Schema.Number })
const ClickedClearCompleted = m("ClickedClearCompleted")
const ClickedRetryLoad = m("ClickedRetryLoad")
/** Silent ack from the NavigateFilter Command — Model already updated in update. */
const NavigationDone = m("NavigationDone")

const SucceededFetchTodos = m("SucceededFetchTodos", {
	items: Schema.Array(TodoItem),
})
const FailedFetchTodos = m("FailedFetchTodos")
const SucceededWriteTodos = m("SucceededWriteTodos", {
	items: Schema.Array(TodoItem),
})
const FailedWriteTodos = m("FailedWriteTodos")
const ClearedCompleted = m("ClearedCompleted", {
	items: Schema.Array(TodoItem),
})

const Message = Schema.Union([
	GotFormMessage,
	ToggledItem,
	RemovedItem,
	ClickedClearCompleted,
	ClickedRetryLoad,
	NavigationDone,
	SucceededFetchTodos,
	FailedFetchTodos,
	SucceededWriteTodos,
	FailedWriteTodos,
	ClearedCompleted,
])
type Message = typeof Message.Type

type UpdateReturn = Update.Return<Model, Message, TodoRepository>

function nextIdFrom(items: ReadonlyArray<TodoItem>): number {
	let max = 0
	for (const item of items) {
		if (item.id > max) max = item.id
	}
	return max + 1
}

const withItems = (model: Model, items: ReadonlyArray<TodoItem>): Model =>
	Struct.evo(model, {
		items: () => items,
		nextId: () => nextIdFrom(items),
		itemsStatus: () => "ready" as const,
	})

/** Programmatic URL writes — the only place that calls `router.navigate`. */
const NavigateFilter = Command.define("NavigateFilter", {
	args: { filter: Filter },
	messages: [NavigationDone],
	execute: ({ filter }) =>
		Effect.promise(() =>
			getRouter().navigate({
				to: "/todo",
				search: { filter },
				replace: true,
			})
		).pipe(Effect.as(NavigationDone())),
})

const FetchTodos = Command.define("FetchTodos", {
	messages: [SucceededFetchTodos, FailedFetchTodos],
	execute: Effect.gen(function* () {
		const repo = yield* TodoRepository
		return yield* repo.getTodos
	}).pipe(
		Effect.match({
			onSuccess: (items) => SucceededFetchTodos({ items }),
			onFailure: () => FailedFetchTodos(),
		})
	),
})

const AddTodo = Command.define("AddTodo", {
	args: {
		id: Schema.Number,
		text: Schema.String,
	},
	messages: [SucceededWriteTodos, FailedWriteTodos],
	execute: ({ id, text }) =>
		Effect.gen(function* () {
			const repo = yield* TodoRepository
			return yield* repo.updateTodos((todos) => [...todos, { id, text, done: false }])
		}).pipe(
			Effect.match({
				onSuccess: (items) => SucceededWriteTodos({ items }),
				onFailure: () => FailedWriteTodos(),
			})
		),
})

const PersistToggle = Command.define("PersistToggle", {
	args: { id: Schema.Number },
	messages: [SucceededWriteTodos, FailedWriteTodos],
	execute: ({ id }) =>
		Effect.gen(function* () {
			const repo = yield* TodoRepository
			return yield* repo.updateTodos((todos) =>
				todos.map((item) => (item.id === id ? { ...item, done: !item.done } : item))
			)
		}).pipe(
			Effect.match({
				onSuccess: (items) => SucceededWriteTodos({ items }),
				onFailure: () => FailedWriteTodos(),
			})
		),
})

const PersistRemove = Command.define("PersistRemove", {
	args: { id: Schema.Number },
	messages: [SucceededWriteTodos, FailedWriteTodos],
	execute: ({ id }) =>
		Effect.gen(function* () {
			const repo = yield* TodoRepository
			return yield* repo.updateTodos((todos) => todos.filter((item) => item.id !== id))
		}).pipe(
			Effect.match({
				onSuccess: (items) => SucceededWriteTodos({ items }),
				onFailure: () => FailedWriteTodos(),
			})
		),
})

const PersistClearCompleted = Command.define("PersistClearCompleted", {
	messages: [ClearedCompleted, FailedWriteTodos],
	execute: Effect.gen(function* () {
		const repo = yield* TodoRepository
		return yield* repo.updateTodos((todos) => todos.filter((item) => !item.done))
	}).pipe(
		Effect.match({
			onSuccess: (items) => ClearedCompleted({ items }),
			onFailure: () => FailedWriteTodos(),
		})
	),
})

/** Seed from route search (and later other Flags). Called when Provider boots. */
const init = (flags: Flags): UpdateReturn => [
	{
		form: TodoForm.init(),
		nextId: 1,
		filter: flags.filter,
		items: [],
		itemsStatus: "loading",
	},
	[FetchTodos()],
]

const update = (model: Model, message: Message): UpdateReturn =>
	Match.value(message).pipe(
		Match.withReturnType<UpdateReturn>(),
		Match.tagsExhaustive({
			GotFormMessage: ({ message: formMessage }) =>
				Submodel.delegate<
					Model,
					Message,
					TodoForm.Model,
					TodoForm.Message,
					TodoForm.OutMessage,
					TodoRepository
				>({
					get: (parent) => parent.form,
					set: (parent, form) => Struct.evo(parent, { form: () => form }),
					update: TodoForm.update,
					wrap: (childMessage) => GotFormMessage({ message: childMessage }),
					onOut: (out, nextModel, commands) =>
						Match.value(out).pipe(
							Match.withReturnType<UpdateReturn>(),
							Match.tagsExhaustive({
								Submitted: ({ text }) => [
									Struct.evo(nextModel, {
										nextId: (nextId) => nextId + 1,
									}),
									[...commands, AddTodo({ id: nextModel.nextId, text })],
								],
							})
						),
				})(model, formMessage),
			ToggledItem: ({ id }) => [model, [PersistToggle({ id })]],
			RemovedItem: ({ id }) => [model, [PersistRemove({ id })]],
			ClickedClearCompleted: () => [model, [PersistClearCompleted()]],
			ClickedRetryLoad: () => [Struct.evo(model, { itemsStatus: () => "loading" as const }), [FetchTodos()]],
			NavigationDone: () => [model, Command.none],
			SucceededFetchTodos: ({ items }) => [withItems(model, items), Command.none],
			FailedFetchTodos: () => [Struct.evo(model, { itemsStatus: () => "failed" as const }), Command.none],
			SucceededWriteTodos: ({ items }) => [withItems(model, items), Command.none],
			FailedWriteTodos: () => [Struct.evo(model, { itemsStatus: () => "failed" as const }), Command.none],
			ClearedCompleted: ({ items }) => {
				const next = withItems(model, items)
				if (model.filter === "completed")
					return [Struct.evo(next, { filter: () => "all" as const }), [NavigateFilter({ filter: "all" })]]

				return [next, Command.none]
			},
		})
	)

const { Provider, useModel, useDispatch } = make({
	update,
	layer: TodoRepository.layer,
})

const filterLinks = [
	{ filter: "all" as const, label: "All" },
	{ filter: "active" as const, label: "Active" },
	{ filter: "completed" as const, label: "Completed" },
]

const visibleItems = (model: Model): ReadonlyArray<TodoItem> =>
	model.items.filter((item) =>
		Match.value(model.filter).pipe(
			Match.withReturnType<boolean>(),
			Match.when("all", () => true),
			Match.when("active", () => !item.done),
			Match.when("completed", () => item.done),
			Match.exhaustive
		)
	)

function View() {
	const model = useModel()
	const dispatch = useDispatch()
	const remaining = model.items.filter((item) => !item.done).length
	const completed = model.items.length - remaining
	const items = visibleItems(model)

	return (
		<ExampleShell
			title="Todo"
			description="Filter comes from URL via Provider init. List data flows through TodoRepository Commands."
		>
			<div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-6 pt-10 pb-16">
				<TodoForm.View
					model={model.form}
					dispatch={function (formMessage) {
						dispatch(GotFormMessage({ message: formMessage }))
					}}
				/>

				<nav
					className="mt-6 flex flex-wrap items-center gap-2"
					aria-label="Filter todos"
				>
					{filterLinks.map(function (link) {
						const active = model.filter === link.filter
						return (
							<Button
								key={link.filter}
								variant={active ? "default" : "ghost"}
								size="sm"
								nativeButton={false}
								render={
									<Link
										to="/todo"
										search={{ filter: link.filter }}
									/>
								}
								aria-current={active ? "page" : undefined}
							>
								{link.label}
							</Button>
						)
					})}
				</nav>

				<div className="mt-4 flex items-center justify-between gap-3">
					<Badge variant="secondary">
						{model.itemsStatus === "loading" ? "Loading…" : `${remaining} left`}
					</Badge>
					{completed > 0 ? (
						<Button
							variant="ghost"
							size="sm"
							onClick={function () {
								dispatch(ClickedClearCompleted())
							}}
						>
							Clear completed
						</Button>
					) : null}
				</div>

				<Separator className="my-5" />

				{model.itemsStatus === "failed" ? (
					<div className="flex flex-col items-center gap-3 py-12">
						<p className="font-heading text-2xl text-muted-foreground italic">Couldn’t load todos</p>
						<Button
							variant="outline"
							size="sm"
							onClick={function () {
								dispatch(ClickedRetryLoad())
							}}
						>
							Retry
						</Button>
					</div>
				) : model.itemsStatus === "loading" && model.items.length === 0 ? (
					<p className="py-12 text-center font-heading text-2xl text-muted-foreground italic">Loading…</p>
				) : items.length === 0 ? (
					<p className="py-12 text-center font-heading text-2xl text-muted-foreground italic">
						{model.items.length === 0 ? "Nothing here yet" : "Nothing in this filter"}
					</p>
				) : (
					<ul className="flex flex-col gap-1">
						{items.map(function (item) {
							const checkboxId = `todo-${item.id}`
							return (
								<li
									key={item.id}
									className="group flex items-center gap-3 rounded-2xl px-2 py-2 transition-colors hover:bg-muted/60"
								>
									<Checkbox
										id={checkboxId}
										checked={item.done}
										onCheckedChange={function () {
											dispatch(ToggledItem({ id: item.id }))
										}}
									/>
									<Label
										htmlFor={checkboxId}
										className={
											item.done
												? "min-w-0 flex-1 text-sm text-muted-foreground line-through"
												: "min-w-0 flex-1 text-sm"
										}
									>
										{item.text}
									</Label>
									<Button
										variant="ghost"
										size="icon-xs"
										className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
										aria-label={`Remove ${item.text}`}
										onClick={function () {
											dispatch(RemovedItem({ id: item.id }))
										}}
									>
										<Trash2Icon />
									</Button>
								</li>
							)
						})}
					</ul>
				)}
			</div>
		</ExampleShell>
	)
}

export function Todo() {
	const { filter } = todoRoute.useSearch()

	return (
		<Provider
			key={filter}
			init={init({ filter })}
		>
			<View />
		</Provider>
	)
}
