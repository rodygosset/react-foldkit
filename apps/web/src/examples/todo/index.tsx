import { getRouteApi, Link } from "@tanstack/react-router"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Label } from "@workspace/ui/components/label"
import { Separator } from "@workspace/ui/components/separator"
import { Effect, Match, Option, Result, Schema } from "effect"
import { Trash2Icon } from "lucide-react"
import type * as React from "react"
import * as AsyncData from "foldkit/asyncData"
import * as Command from "foldkit/command"
import { defineMessageUnion } from "foldkit/message"
import * as Application from "react-foldkit/application"
import { modifyFields } from "foldkit/struct"
import * as Submodel from "react-foldkit/submodel"
import type * as Update from "foldkit/update"
import { ExampleShell } from "../../components/example-shell"
import { getRouter } from "../../router"
import { Filter, TodoItem } from "./model"
import { TodoRepository } from "./repository"
import * as TodoForm from "./todo-form"

const todoRoute = getRouteApi("/examples/todo")

const ItemsData = AsyncData.Schema(Schema.Array(TodoItem), Schema.String)

const Model = Schema.Struct({
	form: TodoForm.Model,
	nextId: Schema.Finite,
	items: ItemsData.schema,
	filter: Filter,
})
type Model = typeof Model.Type

type Flags = {
	filter: Filter
}

const Message = defineMessageUnion({
	GotFormMessage: { message: TodoForm.Message },
	ToggledItem: { id: Schema.Finite },
	RemovedItem: { id: Schema.Finite },
	ClickedClearCompleted: {},
	ClickedRetryLoad: {},
	/** The route search changed, e.g. through a filter link or browser history. */
	ChangedFilter: { filter: Filter },
	/** Silent ack from the NavigateFilter Command — Model already updated in update. */
	NavigationDone: {},
	SettledFetchTodos: {
		result: Schema.Result(Schema.Array(TodoItem), Schema.String),
	},
	SettledWriteTodos: {
		result: Schema.Result(Schema.Array(TodoItem), Schema.String),
	},
	SettledClearCompleted: {
		result: Schema.Result(Schema.Array(TodoItem), Schema.String),
	},
})
type Message = typeof Message.Type

type UpdateReturn = Update.Return<Model, Message, TodoRepository>

const nextIdFrom = (items: ReadonlyArray<TodoItem>): number => Math.max(0, ...items.map((item) => item.id)) + 1

function applySettledItems(model: Model, result: Result.Result<ReadonlyArray<TodoItem>, string>): Model {
	const items = AsyncData.settle(model.items, result)
	return modifyFields(model, {
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
		onNone: () => ({ model, commands: [command] }),
		onSome: (next) => ({ model: modifyFields(model, { items: () => next }), commands: [command] }),
	})

const startFetch = (model: Model): UpdateReturn =>
	Option.match(AsyncData.revalidateOrLoad(model.items), {
		onNone: () => ({ model }),
		onSome: (next) => ({ model: modifyFields(model, { items: () => next }), commands: [FetchTodos()] }),
	})

/** Programmatic URL writes — the only place that calls `router.navigate`. */
const NavigateFilter = Command.define("NavigateFilter", {
	args: { filter: Filter },
	messages: [Message.NavigationDone],
	execute: ({ filter }) =>
		Effect.promise(() =>
			getRouter().navigate({
				to: "/examples/todo",
				search: { filter },
				replace: true,
			})
		).pipe(Effect.as(Message.NavigationDone())),
})

/** Runs a repository call, keeping its failure as a user-facing message in the Result. */
const callRepository = (
	errorMessage: string,
	call: (repo: TodoRepository["Service"]) => Effect.Effect<ReadonlyArray<TodoItem>>
) =>
	Effect.gen(function* () {
		const repo = yield* TodoRepository
		return yield* call(repo)
	}).pipe(
		Effect.mapError(() => errorMessage),
		Effect.result
	)

const writeTodos = (errorMessage: string, f: (todos: ReadonlyArray<TodoItem>) => ReadonlyArray<TodoItem>) =>
	callRepository(errorMessage, (repo) => repo.updateTodos(f)).pipe(
		Effect.map((result) => Message.SettledWriteTodos({ result }))
	)

const FetchTodos = Command.define("FetchTodos", {
	messages: [Message.SettledFetchTodos],
	execute: callRepository("Couldn’t load todos", (repo) => repo.getTodos).pipe(
		Effect.map((result) => Message.SettledFetchTodos({ result }))
	),
})

const AddTodo = Command.define("AddTodo", {
	args: {
		id: Schema.Finite,
		text: Schema.String,
	},
	messages: [Message.SettledWriteTodos],
	execute: ({ id, text }) => writeTodos("Couldn’t save todo", (todos) => [...todos, { id, text, done: false }]),
})

const PersistToggle = Command.define("PersistToggle", {
	args: { id: Schema.Finite },
	messages: [Message.SettledWriteTodos],
	execute: ({ id }) =>
		writeTodos("Couldn’t update todo", (todos) =>
			todos.map((item) => (item.id === id ? { ...item, done: !item.done } : item))
		),
})

const PersistRemove = Command.define("PersistRemove", {
	args: { id: Schema.Finite },
	messages: [Message.SettledWriteTodos],
	execute: ({ id }) => writeTodos("Couldn’t remove todo", (todos) => todos.filter((item) => item.id !== id)),
})

const PersistClearCompleted = Command.define("PersistClearCompleted", {
	messages: [Message.SettledClearCompleted],
	execute: callRepository("Couldn’t clear completed", (repo) =>
		repo.updateTodos((todos) => todos.filter((item) => !item.done))
	).pipe(Effect.map((result) => Message.SettledClearCompleted({ result }))),
})

/** Seeds the filter from the route search. Later search changes arrive as `ChangedFilter`. */
const init = (flags: Flags): UpdateReturn => ({
	model: {
		form: TodoForm.init(),
		nextId: 1,
		filter: flags.filter,
		items: ItemsData.Loading(),
	},
	commands: [FetchTodos()],
})

const form = Submodel.lift<Model>()({
	field: "form",
	update: TodoForm.update,
	toParentMessage: (message: TodoForm.Message) => Message.GotFormMessage({ message }),
	foldOutMessage: (out) => (nextModel) =>
		Match.value(out).pipe(
			Match.withReturnType<UpdateReturn>(),
			Match.tagsExhaustive({
				Submitted({ text }) {
					const withNextId = modifyFields(nextModel, {
						nextId: (nextId) => nextId + 1,
					})
					return withRevalidate(withNextId, AddTodo({ id: nextModel.nextId, text }))
				},
			})
		),
})

const update = (model: Model, message: Message): UpdateReturn =>
	Message.match<UpdateReturn>(message, {
		GotFormMessage: ({ message: formMessage }) => form.fold(model, formMessage),
		ChangedFilter: ({ filter }) => ({ model: modifyFields(model, { filter: () => filter }) }),
		ToggledItem: ({ id }) => withRevalidate(model, PersistToggle({ id })),
		RemovedItem: ({ id }) => withRevalidate(model, PersistRemove({ id })),
		ClickedClearCompleted: () => withRevalidate(model, PersistClearCompleted()),
		ClickedRetryLoad: () => startFetch(model),
		NavigationDone: () => ({ model }),
		SettledFetchTodos: ({ result }) => ({ model: applySettledItems(model, result) }),
		SettledWriteTodos: ({ result }) => ({ model: applySettledItems(model, result) }),
		SettledClearCompleted({ result }) {
			const next = applySettledItems(model, result)
			if (model.filter === "completed" && Result.isSuccess(result)) {
				return {
					model: modifyFields(next, { filter: (): Filter => "all" }),
					commands: [NavigateFilter({ filter: "all" })],
				}
			}
			return { model: next }
		},
	})

const TodoApp = Application.define(
	{ Model, Message, update },
	{
		resources: TodoRepository.layer,
	}
)
const { Provider, useModel, useSend, useInbound } = TodoApp

const filterLinks: ReadonlyArray<{ filter: Filter; label: string }> = [
	{ filter: "all", label: "All" },
	{ filter: "active", label: "Active" },
	{ filter: "completed", label: "Completed" },
]

const isVisible = (item: TodoItem, filter: Filter): boolean =>
	Match.value(filter).pipe(
		Match.withReturnType<boolean>(),
		Match.when("all", () => true),
		Match.when("active", () => !item.done),
		Match.when("completed", () => item.done),
		Match.exhaustive
	)

function FilterNav() {
	const filter = useModel((model) => model.filter)

	return (
		<nav
			className="mt-6 flex flex-wrap items-center gap-2"
			aria-label="Filter todos"
		>
			{filterLinks.map(function (link) {
				const active = filter === link.filter
				return (
					<Button
						key={link.filter}
						variant={active ? "default" : "ghost"}
						size="sm"
						nativeButton={false}
						render={
							<Link
								to="/examples/todo"
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
	)
}

/** The status row and an optional notice above the list, then the list body below a separator. */
function ListSection(props: { status: React.ReactNode; notice?: React.ReactNode; children: React.ReactNode }) {
	return (
		<>
			<div className="mt-4 flex items-center justify-between gap-3">{props.status}</div>
			{props.notice}
			<Separator className="my-5" />
			{props.children}
		</>
	)
}

function TodoRow(props: { item: TodoItem; disabled: boolean }) {
	const send = useSend()
	const { item } = props
	const checkboxId = `todo-${item.id}`

	return (
		<li className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60">
			<Checkbox
				id={checkboxId}
				checked={item.done}
				disabled={props.disabled}
				onCheckedChange={() => send.ToggledItem({ id: item.id })}
			/>
			<Label
				htmlFor={checkboxId}
				className={
					item.done ? "min-w-0 flex-1 text-sm text-muted-foreground line-through" : "min-w-0 flex-1 text-sm"
				}
			>
				{item.text}
			</Label>
			<Button
				variant="ghost"
				size="icon-xs"
				disabled={props.disabled}
				className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
				aria-label={`Remove ${item.text}`}
				onClick={() => send.RemovedItem({ id: item.id })}
			>
				<Trash2Icon />
			</Button>
		</li>
	)
}

function TodoList(props: { items: ReadonlyArray<TodoItem> }) {
	const itemsData = useModel((model) => model.items)
	const filter = useModel((model) => model.filter)
	const send = useSend()
	const remaining = props.items.filter((item) => !item.done).length
	const completed = props.items.length - remaining
	const visible = props.items.filter((item) => isVisible(item, filter))
	const pending = AsyncData.isPending(itemsData)

	return (
		<ListSection
			status={
				<>
					<Badge variant="secondary">{pending ? "Saving…" : `${remaining} left`}</Badge>
					{completed > 0 ? (
						<Button
							variant="ghost"
							size="sm"
							disabled={pending}
							onClick={() => send.ClickedClearCompleted()}
						>
							Clear completed
						</Button>
					) : null}
				</>
			}
			notice={Option.match(AsyncData.getError(itemsData), {
				onNone: () => null,
				onSome: (error) => (
					<p className="mt-3 text-sm text-destructive">
						{error}{" "}
						<button
							type="button"
							className="underline"
							onClick={() => send.ClickedRetryLoad()}
						>
							Retry
						</button>
					</p>
				),
			})}
		>
			{visible.length === 0 ? (
				<p className="py-12 text-center text-2xl font-medium text-muted-foreground">
					{props.items.length === 0 ? "Nothing here yet" : "Nothing in this filter"}
				</p>
			) : (
				<ul className="flex flex-col gap-1">
					{visible.map((item) => (
						<TodoRow
							key={item.id}
							item={item}
							disabled={pending}
						/>
					))}
				</ul>
			)}
		</ListSection>
	)
}

function View() {
	const items = useModel((model) => model.items)
	const send = useSend()

	return (
		<ExampleShell
			title="Todo"
			description="The list is AsyncData. Commands load and save it, and their Results settle back into the Model. The filter lives in the URL."
		>
			<div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-6 pt-10 pb-16">
				<TodoForm.Provider
					from={TodoApp}
					lift={form}
				>
					<TodoForm.View />
				</TodoForm.Provider>
				<FilterNav />
				{AsyncData.matchData(items, {
					onEmpty: () => (
						<ListSection status={<Badge variant="secondary">Loading…</Badge>}>
							<p className="py-12 text-center text-2xl font-medium text-muted-foreground">Loading…</p>
						</ListSection>
					),
					onFailure: (error) => (
						<ListSection status={<Badge variant="destructive">Failed</Badge>}>
							<div className="flex flex-col items-center gap-3 py-12">
								<p className="text-2xl font-medium text-muted-foreground">{error}</p>
								<Button
									variant="outline"
									size="sm"
									onClick={() => send.ClickedRetryLoad()}
								>
									Retry
								</Button>
							</div>
						</ListSection>
					),
					onData: (loadedItems) => <TodoList items={loadedItems} />,
				})}
			</div>
		</ExampleShell>
	)
}

/** Sends route search changes to update, so changing the filter keeps the loaded list. */
function SyncFilter({ filter, children }: { readonly filter: Filter; readonly children: React.ReactNode }) {
	useInbound(filter, (next) => Message.ChangedFilter({ filter: next }))
	return children
}

export function Todo() {
	const { filter } = todoRoute.useSearch()

	return (
		<Provider init={() => init({ filter })}>
			<SyncFilter filter={filter}>
				<View />
			</SyncFilter>
		</Provider>
	)
}
