import { getRouteApi, Link } from "@tanstack/react-router"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Label } from "@workspace/ui/components/label"
import { Separator } from "@workspace/ui/components/separator"
import { Effect, Match, Option, Result, Schema } from "effect"
import { Trash2Icon } from "lucide-react"
import { ReactFoldkit } from "react-foldkit"
import * as AsyncData from "react-foldkit/asyncData"
import * as Command from "react-foldkit/command"
import { m } from "react-foldkit/message"
import { evo } from "react-foldkit/struct"
import * as Submodel from "react-foldkit/submodel"
import * as Update from "react-foldkit/update"
import { ExampleShell } from "../../components/example-shell"
import { getRouter } from "../../router"
import { TodoItem } from "./model"
import { TodoRepository } from "./repository"
import * as TodoForm from "./todo-form"
import { Filter } from "./todo-search"

const todoRoute = getRouteApi("/todo")

const ItemsData = AsyncData.Schema(Schema.Array(TodoItem), Schema.String)

const Model = Schema.Struct({
	form: TodoForm.Model,
	nextId: Schema.Number,
	items: ItemsData.schema,
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

const SettledFetchTodos = m("SettledFetchTodos", {
	result: Schema.Result(Schema.Array(TodoItem), Schema.String),
})
const SettledWriteTodos = m("SettledWriteTodos", {
	result: Schema.Result(Schema.Array(TodoItem), Schema.String),
})
const SettledClearCompleted = m("SettledClearCompleted", {
	result: Schema.Result(Schema.Array(TodoItem), Schema.String),
})

const Message = Schema.Union([
	GotFormMessage,
	ToggledItem,
	RemovedItem,
	ClickedClearCompleted,
	ClickedRetryLoad,
	NavigationDone,
	SettledFetchTodos,
	SettledWriteTodos,
	SettledClearCompleted,
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

function applySettledItems(model: Model, result: Result.Result<ReadonlyArray<TodoItem>, string>): Model {
	const items = AsyncData.settle(model.items, result)
	return evo(model, {
		items: () => items,
		nextId: () =>
			Option.match(AsyncData.getData(items), {
				onNone: () => model.nextId,
				onSome: nextIdFrom,
			}),
	})
}

/** Move Success/Stale → Refreshing when a mutation Command fires; always schedule the Command. */
const withRevalidate = (model: Model, command: Update.Commands<Message, TodoRepository>[number]): UpdateReturn =>
	Option.match(AsyncData.revalidate(model.items), {
		onNone: () => [model, [command]],
		onSome: (next) => [evo(model, { items: () => next }), [command]],
	})

const startFetch = (model: Model): UpdateReturn =>
	Option.match(AsyncData.revalidateOrLoad(model.items), {
		onNone: () => [model, Command.none],
		onSome: (next) => [evo(model, { items: () => next }), [FetchTodos()]],
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
	messages: [SettledFetchTodos],
	execute: Effect.gen(function* () {
		const repo = yield* TodoRepository
		return yield* repo.getTodos
	}).pipe(
		Effect.mapError(() => "Couldn’t load todos"),
		Effect.result,
		Effect.map((result) => SettledFetchTodos({ result }))
	),
})

const AddTodo = Command.define("AddTodo", {
	args: {
		id: Schema.Number,
		text: Schema.String,
	},
	messages: [SettledWriteTodos],
	execute: ({ id, text }) =>
		Effect.gen(function* () {
			const repo = yield* TodoRepository
			return yield* repo.updateTodos((todos) => [...todos, { id, text, done: false }])
		}).pipe(
			Effect.mapError(() => "Couldn’t save todo"),
			Effect.result,
			Effect.map((result) => SettledWriteTodos({ result }))
		),
})

const PersistToggle = Command.define("PersistToggle", {
	args: { id: Schema.Number },
	messages: [SettledWriteTodos],
	execute: ({ id }) =>
		Effect.gen(function* () {
			const repo = yield* TodoRepository
			return yield* repo.updateTodos((todos) =>
				todos.map((item) => (item.id === id ? { ...item, done: !item.done } : item))
			)
		}).pipe(
			Effect.mapError(() => "Couldn’t update todo"),
			Effect.result,
			Effect.map((result) => SettledWriteTodos({ result }))
		),
})

const PersistRemove = Command.define("PersistRemove", {
	args: { id: Schema.Number },
	messages: [SettledWriteTodos],
	execute: ({ id }) =>
		Effect.gen(function* () {
			const repo = yield* TodoRepository
			return yield* repo.updateTodos((todos) => todos.filter((item) => item.id !== id))
		}).pipe(
			Effect.mapError(() => "Couldn’t remove todo"),
			Effect.result,
			Effect.map((result) => SettledWriteTodos({ result }))
		),
})

const PersistClearCompleted = Command.define("PersistClearCompleted", {
	messages: [SettledClearCompleted],
	execute: Effect.gen(function* () {
		const repo = yield* TodoRepository
		return yield* repo.updateTodos((todos) => todos.filter((item) => !item.done))
	}).pipe(
		Effect.mapError(() => "Couldn’t clear completed"),
		Effect.result,
		Effect.map((result) => SettledClearCompleted({ result }))
	),
})

/** Seed from route search (and later other Flags). Called when Provider boots. */
const init = (flags: Flags): UpdateReturn => [
	{
		form: TodoForm.init(),
		nextId: 1,
		filter: flags.filter,
		items: ItemsData.Loading(),
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
					set: (parent, form) => evo(parent, { form: () => form }),
					update: TodoForm.update,
					wrap: (childMessage) => GotFormMessage({ message: childMessage }),
					onOut: (out, nextModel, commands) =>
						Match.value(out).pipe(
							Match.withReturnType<UpdateReturn>(),
							Match.tagsExhaustive({
								Submitted: ({ text }) => {
									const withNextId = evo(nextModel, {
										nextId: (nextId) => nextId + 1,
									})
									const [modelAfterRevalidate, revalidateCommands] = withRevalidate(
										withNextId,
										AddTodo({ id: nextModel.nextId, text })
									)
									return [modelAfterRevalidate, [...commands, ...revalidateCommands]]
								},
							})
						),
				})(model, formMessage),
			ToggledItem: ({ id }) => withRevalidate(model, PersistToggle({ id })),
			RemovedItem: ({ id }) => withRevalidate(model, PersistRemove({ id })),
			ClickedClearCompleted: () => withRevalidate(model, PersistClearCompleted()),
			ClickedRetryLoad: () => startFetch(model),
			NavigationDone: Update.identity(model),
			SettledFetchTodos: ({ result }) => [applySettledItems(model, result), Command.none],
			SettledWriteTodos: ({ result }) => [applySettledItems(model, result), Command.none],
			SettledClearCompleted: ({ result }) => {
				const next = applySettledItems(model, result)
				if (model.filter === "completed" && Result.isSuccess(result)) {
					return [evo(next, { filter: () => "all" as const }), [NavigateFilter({ filter: "all" })]]
				}
				return [next, Command.none]
			},
		})
	)

const { Provider, useModel, useDispatch } = ReactFoldkit.make({
	update,
	layer: TodoRepository.layer,
})

const filterLinks = [
	{ filter: "all" as const, label: "All" },
	{ filter: "active" as const, label: "Active" },
	{ filter: "completed" as const, label: "Completed" },
]

const visibleItems = (items: ReadonlyArray<TodoItem>, filter: Filter): ReadonlyArray<TodoItem> =>
	items.filter((item) =>
		Match.value(filter).pipe(
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

	return (
		<ExampleShell
			title="Todo"
			description="List state is AsyncData: load/refresh via Commands, settle Results back into the Model."
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

				{AsyncData.matchData(model.items, {
					onEmpty() {
						return (
							<>
								<div className="mt-4 flex items-center justify-between gap-3">
									<Badge variant="secondary">Loading…</Badge>
								</div>
								<Separator className="my-5" />
								<p className="py-12 text-center text-2xl font-medium text-muted-foreground">Loading…</p>
							</>
						)
					},
					onFailure(error) {
						return (
							<>
								<div className="mt-4 flex items-center justify-between gap-3">
									<Badge variant="destructive">Failed</Badge>
								</div>
								<Separator className="my-5" />
								<div className="flex flex-col items-center gap-3 py-12">
									<p className="text-2xl font-medium text-muted-foreground">{error}</p>
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
							</>
						)
					},
					onData(items) {
						const remaining = items.filter((item) => !item.done).length
						const completed = items.length - remaining
						const filtered = visibleItems(items, model.filter)
						const pending = AsyncData.isPending(model.items)
						const staleError = AsyncData.getError(model.items)

						return (
							<>
								<div className="mt-4 flex items-center justify-between gap-3">
									<Badge variant="secondary">{pending ? "Saving…" : `${remaining} left`}</Badge>
									{completed > 0 ? (
										<Button
											variant="ghost"
											size="sm"
											disabled={pending}
											onClick={function () {
												dispatch(ClickedClearCompleted())
											}}
										>
											Clear completed
										</Button>
									) : null}
								</div>

								{Option.match(staleError, {
									onNone: () => null,
									onSome(error) {
										return (
											<p className="mt-3 text-sm text-destructive">
												{error}{" "}
												<button
													type="button"
													className="underline"
													onClick={function () {
														dispatch(ClickedRetryLoad())
													}}
												>
													Retry
												</button>
											</p>
										)
									},
								})}

								<Separator className="my-5" />

								{filtered.length === 0 ? (
									<p className="py-12 text-center text-2xl font-medium text-muted-foreground">
										{items.length === 0 ? "Nothing here yet" : "Nothing in this filter"}
									</p>
								) : (
									<ul className="flex flex-col gap-1">
										{filtered.map(function (item) {
											const checkboxId = `todo-${item.id}`
											return (
												<li
													key={item.id}
													className="group flex items-center gap-3 rounded-2xl px-2 py-2 transition-colors hover:bg-muted/60"
												>
													<Checkbox
														id={checkboxId}
														checked={item.done}
														disabled={pending}
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
														disabled={pending}
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
							</>
						)
					},
				})}
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
