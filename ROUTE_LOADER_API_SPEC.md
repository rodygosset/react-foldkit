# Route loader data in a persistent Foldkit Model (proposal)

## Goal and ownership

RecolnAt keeps one ReactFoldkit Provider in TanStack Router's root route. A
page loader's result must be in the root Model **before that page's first
render**, on the server, during hydration, and after client navigation. A
preload for a route that is never entered must not change the Model.

The feature owns its Model, Message, update, and loading Effect. The app embeds
the feature and wraps its Messages. A route file connects its loader to the app.
The root applies Messages from active, resolved routes without knowing which
features produced them. ReactFoldkit and Query have no TanStack-specific API.

## Search feature

The shapes below follow `Query.define`, `defineMessageUnion`, and `query.lift`
in `apps/web/src/examples/api-cache-query/index.tsx`. Imports of RecolnAt
domain schemas and `fetchSpecimens` stand for the corresponding feature code.

```ts
// features/specimen-search/model.ts
import { Effect, Option, Schema } from "effect"
import { defineMessageUnion } from "react-foldkit/message"
import * as Query from "react-foldkit/query"
import type * as Update from "react-foldkit/update"

export const searchQuery = Query.define({
  name: "SpecimenSearch",
  args: { query: SearchListQuery },
  data: SpecimenSearchResponse,
  error: Schema.String,
  execute: ({ query }) => fetchSpecimens(query),
})

export const Model = Schema.Struct({
  activeQuery: Schema.Option(SearchListQuery),
  results: searchQuery.Model,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  GotQueryMessage: { message: searchQuery.Message },
  LoadedFromRoute: {
    query: SearchListQuery,
    result: searchQuery.Model.fields.data,
  },
})
export type Message = typeof Message.Type

const resultsChild = searchQuery.lift<Model, Message>({
  field: "results",
  toParentMessage: (message) => Message.GotQueryMessage({ message }),
})

export const init = (): Model => ({
  activeQuery: Option.none(),
  results: searchQuery.init("specimen-search"),
})

export const update = (
  model: Model,
  message: Message,
): Update.Return<Model, Message> =>
  Message.match<Update.Return<Model, Message>>(message, {
    GotQueryMessage: ({ message }) => resultsChild.fold(model, message),
    LoadedFromRoute: ({ query, result }) => {
      const settled = resultsChild.settle(model, { query }, result)
      return {
        ...settled,
        model: {
          ...settled.model,
          activeQuery: Option.some(query),
        },
      }
    },
  })

export const load = (query: SearchListQuery) =>
  Effect.map(searchQuery.run({ query }), (result) =>
    Message.LoadedFromRoute({ query, result }),
  )
```

`searchQuery.Model.fields.data` reuses the existing `AsyncData` Schema in the
Query Model. No extra public result Schema is needed. The field Schema admits
all AsyncData states, though `Query.run` produces only Success or Failure.
The loader and Message pass through the existing public `AsyncData` type
without local narrowing or conversion.

**Proposed `query.settle`:** a pure, no-fetch update returning
`Update.Return<QueryModel, QueryMessage>`. It takes the public `AsyncData`
type, handles Success and Failure using the existing `AsyncData.settle` policy,
and invalidates an older in-flight Fetch for the same slot. Other AsyncData
states are ignored: installing a Loading or Refreshing value without an owned
Fetch would create a permanently pending slot. When interruption is enabled
the transition may return an interrupt Command. Keyed and single-slot Query
should have symmetric forms. `query.lift(...).settle` folds that return into
the immediate parent Model and lifts any Command, like the existing policies.

## App composition and route file

The app's `GotSearchMessage` case folds `Search.update` using the existing
`Update.foldChild` pattern. It embeds `Search.Model` in the app Model. The
feature never imports this parent.

```ts
// app/model.ts — relevant members only
export const Model = Schema.Struct({ search: Search.Model /* other fields */ })
export const Message = defineMessageUnion({
  GotSearchMessage: { message: Search.Message },
  // Other app Messages...
})

const foldSearch = Update.foldChild({
  update: Search.update,
  read: (model: Model) => Option.some(model.search),
  write: (model: Model, search: Search.Model) => ({ ...model, search }),
  toParentMessage: (message: Search.Message) =>
    Message.GotSearchMessage({ message }),
})

// In the exhaustive App Message.match:
GotSearchMessage: ({ message }) => foldSearch(model, message),
```

The TanStack route is app composition code, so it may wrap a feature Message
in an app Message. Its loader returns data; it never mutates a store:

```tsx
// routes/search/index.tsx
export const Route = createFileRoute("/search/")({
  validateSearch: RouteSearch.pipe(Schema.toStandardSchemaV1),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const query = RouteSearch.make(deps).toSearchListQuery()
    const message = await appRuntime.runPromise(Search.load(query))
    return LoadedRoute.message(
      App.Message.GotSearchMessage({ message }),
    )
  },
  component: SearchPage,
})
```

`LoadedRoute.message` is a small **app-owned typed envelope** with an
`appMessage` field, not a ReactFoldkit API. It gives the root a uniform way
to extract Messages from resolved route matches. The route may return other
page data in the same envelope. The Effect runtime call is supplied by the
app; `appRuntime` is illustrative.

## Root bootstrap and navigation

The root's generic `loadedMessages(matches)` reads only the app-owned
`LoadedRoute` envelope from *active resolved matches*. It does not switch on
route IDs or inspect feature result types. It folds those Messages, in match
order, through the ordinary app `update` for initial `Provider init`.

```tsx
// routes/__root.tsx — relevant parts only
const AppStore = ReactFoldkit.make({ Model: App.Model, update: App.update })

function RootLayout() {
  const matches = useMatches()
  const init = Update.combine(
    App.init(),
    loadedMessages(matches).map((message) => (model: App.Model) =>
      App.update(model, message),
    ),
  )

  return (
    <AppStore.Provider init={init}>
      <AppLayout />
    </AppStore.Provider>
  )
}

function AppLayout() {
  useCommitNavigations()
  return <><Header /><Outlet /><Footer /></>
}

function useCommitNavigations() {
  const router = useRouter()
  const commit = AppStore.useCommit() // proposed; not currently implemented

  React.useEffect(() =>
    router.subscribe("onBeforeRouteMount", () => {
      for (const message of loadedMessages(router.state.matches)) {
        commit(message)
      }
    }),
  [router, commit])
}
```

The root Provider persists across navigation, so later `init` props do not
replace its Model. Initial SSR and hydration instead derive the same Model
from TanStack's resolved, hydrated loader data. Later navigations use ordinary
Messages. `<Seed />` is not needed for this route-loader path.

**Proposed `useCommit`:** delivers one Message through the same `update` and
Command machinery as `useDispatch`, but guarantees that its Model transition
has completed before returning, including when the normal drain would defer
work. It is a host-boundary primitive, not a router API and not a Model setter.
Commands still execute asynchronously. Its ordering against already queued
Messages, and whether the drain budget can be bypassed at this boundary, need
an explicit design and proof before the API is accepted.

## Verification gates before implementation

- Prove that TanStack's `onBeforeRouteMount` callback and a completed commit
  make the new Model visible to the route's **first** render. If that hook
  cannot guarantee it, choose a real pre-render router boundary; do not patch
  over the gap with a page effect or render-time store mutation.
- Confirm the same initial Model on server and hydrating client. Decode any
  schema-bearing loader payload across that boundary as required.
- Confirm preloading and canceled navigations do not commit Messages; repeated
  matches and loader revalidation commit only according to an explicit app
  identity/revision policy.
- Confirm an older Query Fetch cannot overwrite settled loader data, and
  define how pending Fetch interruption works.

The earlier `REACT_SUBMODEL_API_SPEC.md` describes the complementary
child-owned React view hooks; this spec concerns loader-to-Model delivery.
