# Use a router

The router owns the URL. The Model keeps a copy of the parts it needs, such as a filter or a selected id. Values move between the two in two directions, and each direction has one place in the code.

| Direction | When | How |
| --- | --- | --- |
| URL to Model | The page loads | The route's value goes into `init` |
| URL to Model | The URL changes later | `useInbound` turns the new value into a Message |
| Model to URL | The user clicks a link | The router's `<Link>` changes the URL, which comes back through `useInbound` |
| Model to URL | `update` decides to move | `update` returns a Command that calls the router |

Views never call `navigate` directly. Navigation is a side effect, so it belongs in a Command, like a fetch. That keeps `update` pure, and a test sees the navigation in `update`'s result without a router.

The examples below come from the [todo demo](https://github.com/rodygosset/react-foldkit/tree/main/apps/web/src/examples/todo), which uses TanStack Router.

## Read the URL into the Model

Validate the search with the same Schema the Model uses:

```ts
// routes/examples/todo.tsx
export const Route = createFileRoute("/examples/todo")({
	validateSearch: TodoSearch.pipe(Schema.toStandardSchemaV1),
	component: Todo,
})
```

The route component passes the first value to `init`. `useInbound` sends every later change as a Message:

```tsx
const todoRoute = getRouteApi("/examples/todo")

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
```

`useInbound` skips the first value, because `init` already has it. Back and forward buttons work with no extra code, because they change the search too.

`update` stores the new value like any other Message:

```ts
ChangedFilter: ({ filter }) => ({ model: modifyFields(model, { filter: () => filter }) }),
```

## Let links change the URL

A user click needs no Message of its own. Render the router's `<Link>`, and the change comes back through `useInbound`:

```tsx
<Link to="/examples/todo" search={{ filter: "active" }} />
```

## Change the URL from update

Keep one router instance in its own module, so a Command can reach it. On the server, build a new router for each request instead. Server rendering handles requests at the same time, and a shared router would mix their state:

```ts
// router.tsx
let router: AppRouter | undefined

export function getRouter(): AppRouter {
	if (typeof window === "undefined") return createAppRouter()
	router ??= createAppRouter()
	return router
}
```

Commands run only in the browser, so they always get the shared router.

Define a Command that calls `navigate`:

```ts
const NavigateFilter = Command.define("NavigateFilter", {
	args: { filter: Filter },
	messages: [Message.CompletedNavigateFilter],
	execute: ({ filter }) =>
		Effect.promise(() =>
			getRouter().navigate({
				to: "/examples/todo",
				search: { filter },
				replace: true,
			})
		).pipe(Effect.as(Message.CompletedNavigateFilter())),
})
```

Then return it from `update`. Set the Model in the same step, so the view doesn't wait for the URL:

```ts
return {
	model: modifyFields(next, { filter: (): Filter => "all" }),
	commands: [NavigateFilter({ filter: "all" })],
}
```

The new URL then comes back through `useInbound` as `ChangedFilter`. The Model already holds that value, so the Message changes nothing.

## Allow the router file in the lint rule

The `no-navigate-outside-commands` rule from the [ESLint presets](../eslint/README.md) reports `navigate` calls outside a Command. Files that set up the router are allowed to call it. List them in `urlBridgePaths`:

```js
// eslint.config.js
export default [
	...recommendedConfig,
	{
		settings: {
			"react-foldkit": {
				urlBridgePaths: ["**/router.tsx", "**/routes/**"],
			},
		},
	},
]
```

## Use another router

The same pattern works with any router that has a `navigate` function you can call outside a component. Read the URL in the route component, send changes with `useInbound`, and call `navigate` from a Command.
