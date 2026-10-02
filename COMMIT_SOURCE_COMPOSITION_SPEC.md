# CommitSource and TanStack integration

**Implemented.** Loader declarations and the TanStack adapter build on the
existing Provider, commit, Query, and projection APIs.

This replaces the app-owned envelopes/adapter in
[the route-loader spec](ROUTE_LOADER_API_SPEC.md):

- `Loader.define` / `Loader.fromQuery` for typed loader envelopes.
- `Loader.mapMessages` for root Message composition at the parent wire.
- `Loader.load` (dual) and `Loader.loadQuery` for envelope programs.
- `Query.settleIf` / `Query.settleIfLoad` for freshness-gated external settlement.
- `TanStackSource.make` for accepted router results.
- `SubmodelProvider` for inline child Provider composition.
- `CommitSource` remains the sync delivery protocol only.

## State ownership

Keep query state in the persistent root Model. Embed Query Models and use their
policies and `lift`. Add feature state, such as drafts, where needed.

The host runs loaders. Initial results populate init; later results arrive as
root Messages. App effects remain Commands. Preloads stay in the router until
navigation accepts their match.

Loaders and Query Commands fetch independently. Update checks freshness and
relevance; tokens prevent duplicate delivery.

### Accepting cached results

A Query refresh may be newer than a cached loader result. Check freshness
**before settlement** to preserve data and pending requests when rejecting it.
Request IDs protect Query completions; delivery UUIDs do not order data.

The example uses an increasing server revision:

- Ignore Success with an older or equal revision, preserving any pending refresh.
- Install Failure only in an empty, nonpending slot. To show loader errors over
  existing data, track receipts separately. Query refresh failures keep good data.

The Model can track receipts and acceptance. If Query completions also check
revisions, still complete rejected requests so they do not stay pending.

## Example conventions

- `import { Query } from "react-foldkit"`; export `query = Query.define(...)`;
  callers use `Project.query`. Alias its Model and Message Schemas/types.
- Export `Provider`, `useModel`, and `useDispatch` from `defineSubmodel<Model, Message>()`.
  Callers use `Project.Provider`.
- Views use these bindings and ReactFoldkit hooks. Keep route hooks in app glue
  and lifecycle hooks in Providers.
- Use `Project.Loader` and the application namespace `Application`.
- Use one project Query with static `Effect.succeed` data. Run Promises at route
  boundaries; omit server functions and custom async fetching.

## CommitSource protocol

Export `react-foldkit/commitSource` and the root `CommitSource` namespace for the
sync snapshot protocol (`CommitEntry`, `CommitSource`, `CommitSourceOptions`,
`CommitSourceError`). Keep those types re-exported from `react-foldkit/react`.
Internal `commit-source.make` delivers snapshots through root commit.

## Loader module

Export `react-foldkit/loader` and the root `Loader` namespace. Declarations,
encoding, and Message mapping live here.

### define / fromQuery

```ts
import { fromQuery } from "react-foldkit/loader"

export const Loader = fromQuery(query)
// Query: fromQuery(query, { key: () => "home" })
// or define({ name, data, key }) for non-Query payloads
```

| Option | Contract                                                                                          |
| ------ | ------------------------------------------------------------------------------------------------- |
| `name` | Stable name, unique in the adapter registry. Taken from `query.name` when using `fromQuery`. |
| `data` | Schema Codec. Loading, keys, and mapping use decoded values; the envelope carries encoded values. |
| `key`  | Resource key from decoded data. Optional for KeyedQueries (defaults to `query.toKey`); required for Queries. |

Map to root Messages with `Loader.mapMessages` at the app registry. Prefer that
over embedding app Message types in the entity declaration.

Codecs need no services and must decode synchronously, including during SSR.
The host handles native Schema defects. Loading Effects can require services;
`load` preserves those requirements.

Declarations are Pipeable. Methods work in pipelines without a JavaScript receiver.

### load / loadQuery

```ts
const program = Project.Loader.loadQuery({ projectId })
// dual: Loader.loadQuery({ projectId })(Project.Loader)
```

`Loader.load` (dual) lazily produces an envelope:

```text
Effect<Payload, E, R> → Effect<Envelope, E | EncodingError, R>
```

Use the unary method, the dual, or `loadQuery`. It accepts no Layer or
ManagedRuntime and preserves input errors, services, and defects.

Each execution runs the input, encodes its payload, computes the key, and allocates
one string token. Building the Effect does no work; logging, tracing, recovery,
and timeouts can be composed before running it.

The versioned envelope contains a marker, declaration name, resource key, token,
and encoded payload. Native Schema encoding handles AsyncData, Date, Option,
and HashMap. Caching, transport, decoding, and mapping preserve the token.

An input failure produces no envelope. `Query.run` succeeds with AsyncData
Success or Failure; both are valid payloads. Update decides whether to install them.

### Host execution

Run service-free programs with `Effect.runPromise`. Supply services through
Context/Layer or an app-owned ManagedRuntime in router context:

```ts
loader: ({ params, context, abortController }) =>
  context.runtime.runPromise(
    ProjectDetails.load(params.projectId),
    { signal: abortController.signal },
  ),
```

The host creates, cancels, and disposes runtimes. Server session/tenant services
live per request; reusable client services live with the router/app. Stop loads
before disposal. Aborting one load must not dispose a shared runtime.

```ts
const runtime = ManagedRuntime.make(applicationLayer)
const program = Loader.load(inputWithServices)
const result = runtime.runPromise(program, { signal: abortController.signal })

// Execute at host teardown, after outstanding loads stop.
const dispose = runtime.disposeEffect
```

Keep Layer resources in the runtime Scope. Initialization errors occur at
execution, outside `Loader.load`'s error type. Share service instances explicitly
between Provider Command Layers and loader runtimes when needed.

### mapMessages

```ts
Project.Loader.pipe(Loader.mapMessages((load) => Application.Message.CompletedLoadProject({ load })))
```

Mappings compose in order when the adapter decodes accepted data. They preserve
the Schema, name, key, encoding, and token, without fetching or changing the Model.
Lift Messages at the parent wire (app registry), not in the entity module.

The optional second argument is the delivery receipt:

```ts
Loader.mapMessages((load, receipt) => Message.CompletedLoadProject({ load, receipt }))
```

A receipt contains the declaration name, resource key, and string token. Export
its Schema for Message fields and preserve it through mappings. Update still
checks freshness via `settleIf`; the example needs only the payload.

## TanStack adapter

Add the optional `react-foldkit/tanstack` entry point:

```ts
const source = TanStackSource.make(router, [
	[Project.Loader, (load) => Application.Message.CompletedLoadProject({ load })],
])
```

One registry and subscription serve all declarations. Payload types stay inferred;
mapped values fit the root Message union. Duplicate names fail at construction.

- Return the existing synchronous `CommitSource<RootMessage>`.
- Read successful active matches in order. Skip pending matches, preloads,
  unrelated data, and unregistered envelopes. Malformed registered envelopes fail.
- Use a tuple of match ID, declaration name, and resource key. Matches can share
  a resource without duplicate keys; update chooses which version to keep.
- Subscribe once, including revalidation. Notifications expose the new snapshot;
  delivery must finish before rendering, including with queued edits and native scheduling.
- Use the fixture's tested match publication. `onResolved` has no proven timing guarantee.
- Preserve tokens through SSR/hydration. Isolate server state per request;
  subscribe only on the client.
- Keep router imports and type compatibility here; apps need no local augmentation.
- Document tested versions and optional peer dependencies. Core consumers must
  build without TanStack installed.

Replace the fixture adapter; keep its router, hydration, and browser tests.

## Provider commitSource

```tsx
<Application.Provider
	init={Application.init()}
	commitSource={source}
>
	{children}
</Application.Provider>
```

The optional prop validates the snapshot, folds Messages through update in order,
preserves Commands, and uses that snapshot as the baseline. SSR/hydration reads
the populated Model; activation connects without replaying initial Messages.

Omit the prop for ordinary Provider behavior, or connect manually with
`useCommitSource`. Keep the source fixed while mounted; changes raise `SourceChanged`.
Reconnects keep successful tokens and read the latest snapshot. Source removal
leaves Model data intact.

## SubmodelProvider

Expose the helper from `defineApplication` and `defineSubmodel`. Reuse their
projection code; the definition binds parent types and the projection infers child types.

```ts
function SubmodelProvider<Model, Message>(props: {
	readonly projection: SubmodelProjection<ParentModel, ParentMessage, Model, Message>
	readonly render: (props: { readonly source: ModelSource<Model, Message> }) => React.ReactNode
}): React.ReactNode
```

```tsx
<Application.SubmodelProvider
	projection={Application.projectsProjection}
	render={({ source }) => <Project.Provider source={source}>{children}</Project.Provider>}
/>
```

Call `useSubmodel`, then `render({ source })`. Close over children and put hooks
in the rendered components.

The helper projects an existing `ModelSource` without creating a store, initializing
state, running Commands, or subscribing to the whole parent. `CommitSource` delivers
external Messages. Use `useOptionalSubmodel` for optional projections.

## Feature-Sliced Design example

Configure Start's routes and generated tree in `src/app`; supply normal framework
setup separately. Route files bind the framework; pages compose loading.

```text
src/
  app/
    model/application.ts
    providers/provider.tsx
    routes/__root.tsx
    routes/projects.$projectId.tsx
  pages/project-details/
    api/load.ts
    ui/view.tsx
    index.ts
  features/refresh-project/
    ui/view.tsx
    index.ts
  entities/project/
    model/project.ts
    model/query.ts
    api/loader.ts
    ui/provider.tsx
    index.ts
```

Import through public indexes, from app to pages, features, entities, and shared.
Pages/features never import the app store. They receive a refresh callback;
route glue turns it into a root Message.

### Project entity

```ts
// entities/project/model/project.ts
import { Schema } from "effect"

export const Project = Schema.Struct({
	id: Schema.String,
	revision: Schema.Number,
	name: Schema.String,
	description: Schema.String,
})
export type Project = typeof Project.Type
```

```ts
// entities/project/model/query.ts
import { Effect, Schema } from "effect"
import { Query } from "react-foldkit"
import { Project } from "./project"

export const query = Query.define({
	name: "Project",
	args: { projectId: Schema.String },
	data: Project,
	error: Schema.String,
	execute: ({ projectId }) =>
		Effect.succeed(
			Project.make({
				id: projectId,
				revision: 1,
				name: "Website redesign",
				description: "Replace the company website before launch.",
			})
		),
})

export const Model = query.Model
export type Model = typeof Model.Type
export const Message = query.Message
export type Message = typeof Message.Type
```

```tsx
// entities/project/ui/provider.tsx
import { defineSubmodel } from "react-foldkit/react"
import type { Model, Message } from "../model/query"

export const { useModel, useDispatch, Provider } = defineSubmodel<Model, Message>()
```

```ts
// entities/project/api/loader.ts
import { fromQuery } from "react-foldkit/loader"
import { query } from "../model/query"

export const Loader = fromQuery(query)
export const Load = Loader.Load
export type Load = typeof Load.Type
```

```ts
// entities/project/index.ts
export { Project } from "./model/project"
export { query, Model, Message } from "./model/query"
export { Loader, Load } from "./api/loader"
export { Provider, useModel, useDispatch } from "./ui/provider"
```

### Feature and page

```tsx
// features/refresh-project/ui/view.tsx
import * as AsyncData from "react-foldkit/asyncData"
import * as Project from "@/entities/project"

export function View({ projectId, onRefresh }: { projectId: string; onRefresh: () => void }) {
	const result = Project.useModel((model) => Project.query.read(model, { projectId }))
	return (
		<button
			disabled={AsyncData.isPending(result)}
			onClick={onRefresh}
		>
			Refresh project
		</button>
	)
}
```

```ts
// features/refresh-project/index.ts
export { View } from "./ui/view"
```

```ts
// pages/project-details/api/load.ts
import * as Loader from "react-foldkit/loader"
import * as Project from "@/entities/project"

export const load = (projectId: string) => Project.Loader.loadQuery({ projectId })
```

```tsx
// pages/project-details/ui/view.tsx
import * as AsyncData from "react-foldkit/asyncData"
import * as Project from "@/entities/project"
import * as RefreshProject from "@/features/refresh-project"

export function View({ projectId, onRefresh }: { projectId: string; onRefresh: () => void }) {
	const result = Project.useModel((model) => Project.query.read(model, { projectId }))
	return (
		<main>
			{AsyncData.matchData(result, {
				onEmpty: () => <p>Loading project…</p>,
				onFailure: (error) => <p role="alert">{error}</p>,
				onData: (project) => (
					<section>
						<h1>{project.name}</h1>
						<p>{project.description}</p>
					</section>
				),
			})}
			<RefreshProject.View
				projectId={projectId}
				onRefresh={onRefresh}
			/>
		</main>
	)
}
```

```ts
// pages/project-details/index.ts
export { load } from "./api/load"
export { View } from "./ui/view"
```

### Application

```ts
// app/model/application.ts
import { Schema } from "effect"
import { defineMessageUnion } from "react-foldkit/message"
import { defineApplication, defineSubmodelProjection } from "react-foldkit/react"
import type * as Update from "react-foldkit/update"
import * as Project from "@/entities/project"

export const Model = Schema.Struct({ projects: Project.Model })
export type Model = typeof Model.Type
export const Message = defineMessageUnion({
	GotProjectMessage: { message: Project.Message },
	CompletedLoadProject: { load: Project.Loader.Load },
	ClickedRefreshProject: { projectId: Schema.String },
})
export type Message = typeof Message.Type

const toProjectMessage = (message: Project.Message) => Message.GotProjectMessage({ message })

const projects = Project.query.lift<Model, Message>({
	field: "projects",
	toParentMessage: toProjectMessage,
})

export const update = (model: Model, message: Message) =>
	Message.match<Update.Return<Model, Message>>(message, {
		GotProjectMessage: ({ message }) => projects.fold(model, message),
		CompletedLoadProject: ({ load }) =>
			projects.settleIfLoad(model, load, {
				fresher: (incoming, current) => incoming.revision > current.revision,
			}),
		ClickedRefreshProject: ({ projectId }) => projects.revalidateOrLoad(model, { projectId }),
	})

export const init = (): Update.Return<Model, Message> => ({
	model: { projects: Project.query.init("projects") },
})

export const projectsProjection = defineSubmodelProjection({
	read: (model: Model) => model.projects,
	toParentMessage: toProjectMessage,
})

export const { Provider, useModel, useDispatch, SubmodelProvider } = defineApplication({ Model, update })
```

```tsx
// app/providers/provider.tsx
import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import * as Loader from "react-foldkit/loader"
import * as TanStackSource from "react-foldkit/tanstack"
import * as Project from "@/entities/project"
import * as Application from "../model/application"

export function Provider({ children }: { children: React.ReactNode }) {
	const router = useRouter()
	const [source] = React.useState(() =>
		TanStackSource.make(router, [
			Project.Loader.pipe(
				Loader.mapMessages((load) => Application.Message.CompletedLoadProject({ load }))
			),
		])
	)

	return (
		<Application.Provider
			init={Application.init()}
			commitSource={source}
		>
			<Application.SubmodelProvider
				projection={Application.projectsProjection}
				render={({ source }) => <Project.Provider source={source}>{children}</Project.Provider>}
			/>
		</Application.Provider>
	)
}
```

```tsx
// app/routes/projects.$projectId.tsx
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import * as ProjectDetails from "@/pages/project-details"
import * as Application from "../model/application"

export const Route = createFileRoute("/projects/$projectId")({
	loader: ({ params, abortController }) =>
		Effect.runPromise(ProjectDetails.load(params.projectId), {
			signal: abortController.signal,
		}),
	component: View,
})

function View() {
	const { projectId } = Route.useParams()
	const dispatch = Application.useDispatch()
	return (
		<ProjectDetails.View
			projectId={projectId}
			onRefresh={() => dispatch(Application.Message.ClickedRefreshProject({ projectId }))}
		/>
	)
}
```

```tsx
// app/routes/__root.tsx
import * as React from "react"
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router"
import { Provider } from "../providers/provider"

export const Route = createRootRoute({ component: View, shellComponent: Document })

function View() {
	return (
		<Provider>
			<Outlet />
		</Provider>
	)
}

function Document({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	)
}
```

Keep the example compiling against emitted exports. Server/hydration reads must
agree, and navigation Messages must arrive before rendering. Freshness checks
may keep newer data or pending work.

## Implementation requirements

Reuse Query, ModelSource projections, source reconciliation, and the Provider prop.

1. Export Pipeable declarations, lazy encoding, and Message/receipt mapping.
   Preserve payload inference, errors, and services; accept no execution arguments.
2. Add the TanStack registry, envelope decoding, tuple keys, one subscription,
   cleanup, and router type compatibility.
3. Add `SubmodelProvider` to the shared projection helper. Infer child types and
   keep render props exactly `{ source }`.
4. Add exports, build entries, and optional peers; preserve existing exports and core-only builds.
5. Replace the fixture adapter, compile the FSD example against emitted exports,
   and update docs/examples.

### Required checks

- Types: inferred payloads/mappings, preserved services/errors, pipelines,
  rejected Layer/runtime arguments, and required host services.
- Load: lazy execution/tokens, Schema transforms, input failures, ManagedRuntime,
  initialization failure, abort, request isolation, and disposal.
- Adapter: multiple declarations, duplicate names, malformed registered payloads,
  shared resources across matches, stable receipts/tokens, and cleanup.
- Routing: first navigation/revalidation renders, preloads, cancellation,
  cached return, queued edits, SSR/hydration, and native browser scheduling.
- Freshness: Query revision 2 survives cached loader revision 1; rejected deliveries
  preserve pending requests; unversioned failures follow the example's policy.
- Projections: inference, Message lifting, stable sources, siblings/nesting,
  no subscription to the whole parent, and rejection of incompatible projections
  or access to children through render props.

## Limits and later work

- Each adapter must prove delivery timing.
- Loaders still fetch independently. An `ensureQueryData`-style cache lookup is separate work.
- Source removal clears delivery records, not query entries. Eviction and
  revalidation remain application/Query policies.
- Other adapters, optional projection components, decoding services, and general
  source composition are deferred.

A future `CommitSource.combine({ projects, notifications })` could namespace keys,
join snapshots in order, and acquire subscriptions with scoped rollback. Delivery
must stay synchronous; asynchronous Streams cannot guarantee the first render.
