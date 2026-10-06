# react-foldkit

React bindings for the Elm Architecture, built on [Foldkit](https://foldkit.dev),
[Effect](https://effect.website/), and [React](https://react.dev/).

One Model holds application state. Pure updates handle Messages and return
Commands; Subscriptions describe ongoing work. ReactFoldkit adds a store and
React lifecycle to Foldkit's APIs.

See [Foldkit's docs](https://foldkit.dev) and
[manifesto](https://foldkit.dev/get-started/manifesto). `apps/web` has Todo,
Stopwatch, AsyncData, and Query examples.

## Imports

Import from `react-foldkit` or `react-foldkit/*`. Foldkit is a regular dependency,
excluded from the package output. This workspace uses the sibling Foldkit
checkout on `feat/query-httpapi` with Effect `4.0.0`.

Import Query directly from Foldkit:

```ts
import * as Query from "foldkit/experimental/query"
```

```tsx
import { ReactFoldkit } from "react-foldkit"
import { defineMessageUnion } from "react-foldkit/message"
```

| Entry point                                                  | API                                                                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `./react`                                                    | Application/child Providers, Model selectors, dispatch, projections, and external-source delivery |
| `./store`                                                    | Non-React hosts: boot, commit, and `takeWhen`                                                     |
| `./command`, `./message`, `./update`, `./struct`, `./schema` | Foldkit composition and data helpers                                                              |
| `./asyncData`                                                | Remote-data states and transitions                                                                |
| `./subscription`                                             | Model-gated ongoing work                                                                          |
| `./eslint`                                                   | Recommended and strict presets                                                                    |

## Quick start

```tsx
import { Schema } from "effect"
import { defineMessageUnion } from "react-foldkit/message"
import { defineApplication } from "react-foldkit/react"
import { modifyFields } from "react-foldkit/struct"
import type * as Update from "react-foldkit/update"

const Model = Schema.Struct({ count: Schema.Number })
type Model = typeof Model.Type

const Message = defineMessageUnion({
	Increment: {},
})
type Message = typeof Message.Type

const update = (model: Model, message: Message): Update.Return<Model, Message> =>
	Message.match<Update.Return<Model, Message>>(message, {
		Increment: () => ({ model: modifyFields(model, { count: (n) => n + 1 }) }),
	})

const { Provider, useModel, useDispatch } = defineApplication({ Model, update })

function CounterView() {
	const count = useModel((m) => m.count)
	const dispatch = useDispatch()

	return (
		<button
			type="button"
			onClick={function () {
				dispatch(Message.Increment())
			}}
		>
			{count}
		</button>
	)
}

export function Counter() {
	return (
		<Provider init={{ model: { count: 0 } }}>
			<CounterView />
		</Provider>
	)
}
```

## Child views

A child defines its own bindings:

```tsx
// settings.tsx — Model, Message, and update are defined in this module.
import { defineSubmodel } from "react-foldkit/react"

const { useModel, useDispatch, Provider } = defineSubmodel<Model, Message>()

export { Provider }

export function View() {
	const model = useModel()
	const dispatch = useDispatch()
	return <button onClick={() => dispatch(Message.ClickedSave())}>{model.label}</button>
}
```

The parent embeds the Model, wraps Messages, and uses `Update.foldChild` for
updates. Views read a stable projection of the root store:

```tsx
import * as Settings from "./settings"
import { defineSubmodelProjection } from "react-foldkit/react"

const settingsProjection = defineSubmodelProjection({
	read: (model: Model) => model.settings,
	toParentMessage: (message: Settings.Message) => Message.GotSettingsMessage({ message }),
})

function ParentView() {
	const source = App.useSubmodel(settingsProjection)
	return (
		<Settings.Provider source={source}>
			<Settings.View />
		</Settings.Provider>
	)
}
```

The root creates the store and runs Commands and Subscriptions. Child Providers
supply view context. `defineSubmodel<Model, Message>()` takes only types;
hooks outside their matching Provider throw `SubmodelProviderError`.

| Hook                                     | Behavior                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `useModel()`                             | Reads the whole Model.                                                                                              |
| `useModel(selector, isEqual?)`           | Infers the selection; defaults to `Equal.equals`. Equal values keep their reference and skip source-driven renders. |
| `useDispatch()`                          | Returns dispatch without subscribing.                                                                               |
| `useSubmodel({ read, toParentMessage })` | Projects the root or child source without subscribing the parent view.                                              |

Parent, prop, state, and context changes can still render consumers. React's
selector helper protects committed selections from abandoned renders. Keep
projection functions stable; reads cache by snapshot identity, separately for
live and server snapshots.

`useOptionalSubmodel` takes an Option-returning read and returns an Option source.
It tracks presence; render a Provider for `Some`. A removed child's source keeps
its last snapshot until unmount.

Give recreated children fresh parent-owned IDs, even for the same business key.
Carry the ID in Messages, guard the parent fold's read, and use it as the React
key. This rejects stale handlers and Command results. Update handles cancellation;
unmounting alone does not cancel Commands.

See `REACT_SUBMODEL_API_SPEC.md` and TodoForm for composition and OutMessages.

## Queries

`Query.define` from `foldkit/experimental/query` creates a remote-data Submodel.
Plain Queries use `init()`. Enable `interrupt: true` and use `init(instanceId)`
when pending Fetches need cancellation. Read values with `query.read(model)` or
`keyedQuery.read(model, args)`. Generations reject obsolete completions.

| API | Behavior |
| --- | --- |
| `loadIfMissing`, `revalidate`, `revalidateOrLoad`, `replace` | Pure Model transitions returning Fetch Commands |
| `reset` | Clears data and preserves request identity |
| Keyed `forget`, `retainOnly` | Removes individual or unretained slots and cancels pending Fetches |
| `query.lift` | Parent fold and policy operations; accepts `parentField` or a read/write lens |
| `query.run` / `keyedQuery.run(args)` | Loading Effect without Model writes |
| `Query.HttpApi.Service.query` | Derives endpoint Schemas, client service, and keyed request args |

Wrap Query Messages as `{ message: query.Message }`, pass `toParentMessage` to
`lift`, and handle completions with `queryChild.fold(model, message)`.
Subscriptions can emit application Messages whose update handlers call Query
operations. The cache demos prune post-detail entries through `retainOnly`.

### External settlement

`Loader.fromQuery(query, options)` binds a Foldkit Query to explicit `name`,
`data`, `error`, and `key` values. Keyed Queries also need `args` Schemas. The
returned `Load` Schema contains decoded args and an AsyncData `result`.
`loadQuery` executes and encodes the bound Query in the host's Effect runtime.

```ts
const loader = Loader.fromQuery(query, {
  name: "Project",
  args: { projectId: Schema.String },
  data: Project,
  error: Schema.String,
  key: ({ projectId }) => projectId,
})
```

In update, peel args and `result` from the Loader payload and use
`Loader.settleQueryIf(query, model, args, result, { fresher })`. The plain Query
form omits args. A Success replaces cached data when `fresher` accepts it. Failure
is accepted only for empty, non-pending data unless `acceptFailure` supplies a
custom policy. Other AsyncData variants leave the Model unchanged.

The adapter uses Foldkit's reset/forget, loading transitions, and completion
Messages to apply accepted outcomes. It reserves a fresh generation without
executing a Fetch and returns cancellation Commands for the previous request.
Parent updates embed the returned Query Model and map those Commands to parent
Messages. See `examples/project-cache` for the complete composition.

Delivery tokens, resource keys, and domain revisions are separate layers; see
[COMMIT_SOURCE_COMPOSITION_SPEC.md](../../COMMIT_SOURCE_COMPOSITION_SPEC.md).

## Commit and external sources

`useCommit()` drains FIFO through the submitted Message, even if dispatch yielded.
It returns `Result<void, CommitError>` after update and store notifications.
Commands stay asynchronous; rendering may follow. Later Messages keep normal scheduling.

Inactive, reentrant, crashed, or disposed stores return Failure. Calls during
update or synchronous notification are reentrant; crashes retain their Cause.
Use dispatch for UI events and commit when the host needs the updated Model immediately.

`Store.commit(store, message)` is the lazy Effect adapter over that same queue:

```ts
import { Effect, Result } from "effect"
import * as Store from "react-foldkit/store"

// Immediate delivery.
const outcome = commit(message)
if (Result.isFailure(outcome)) handleCommitFailure(outcome.failure)

// Lazy delivery through Effect.
const delivery = Store.commit(store, message)
const exit = Effect.runSyncExit(delivery)
```

### Provider connection

The optional `commitSource` prop handles initial and later deliveries:

```tsx
import { defineApplication, type CommitSource } from "react-foldkit/react"

// App.init() returns the initial Model and optional Commands.
const Application = defineApplication({ Model: App.Model, update: App.update })

function Root({ source }: { source: CommitSource<App.Message> }) {
	return (
		<Application.Provider
			init={App.init()}
			commitSource={source}
		>
			<AppView />
		</Application.Provider>
	)
}
```

Provider validates the initial snapshot, applies its Messages through update,
and preserves Commands. SSR/hydration reads the populated Model; connections
and Commands start on client activation. Keep update pure for Strict Mode.

Keep the source fixed while mounted. Adding, removing, or replacing it raises
`CommitSourceError` with reason `SourceChanged`. Omit the prop when unused;
changes to init do not reset the Model. Provider `commitSource` is the only
bootstrap path: it folds the initial snapshot and connects later deliveries.

### Source contract

A `CommitSource<Message>` provides synchronous `getSnapshot()` and
`subscribe(notify): unsubscribe`. Each entry has:

| Field                       | Meaning                                  |
| --------------------------- | ---------------------------------------- |
| `key: string`               | Unique within the snapshot               |
| `version: string \| number` | Delivery token compared with `Object.is` |
| `message: Message`          | Root Message                             |

Unchanged key/version pairs are skipped. New versions deliver; observed removal
clears the record so re-entry delivers again. Tokens identify deliveries; update
checks freshness and relevance.

Connections use the baseline once, start after activation, and subscribe before
rereading. Successful tokens survive Strict Mode/Activity reconnects. Reconnects
see the latest snapshot, not missed events or identical removal/re-entry while disconnected.

Notifications must expose accepted data synchronously; the callback commits it.
Test router adapters to ensure this happens before the page renders. Core entry
points need no router; `react-foldkit/tanstack` uses optional TanStack peers.

Duplicate keys, source replacement, and reentrant notifications raise
`CommitSourceError`. Validation returns Result; reconciliation and cleanup use
Effect. React/source callbacks use `runSync`; inspect the full Cause with
`runSyncExit`. Render contract violations throw. Catch-up failures release the
connection; disconnected callbacks do nothing. SSR does not subscribe.

## Server rendering and lifetimes

The server renders init with the source snapshot applied. Hydration needs
equivalent data. Commands, Subscriptions, and Layer resources start on client
activation. Disconnected dispatches are ignored.

Interrupted init Commands restart on reconnect; completed ones do not repeat.
Subscriptions and Layer resources restart with each activation.

`defineApplication` takes `Store.Config` plus `Model: Schema.Codec`. Preload data
through init or a stable commitSource on the persistent Provider.

## ESLint

```js
import { recommendedConfig } from "react-foldkit/eslint"

export default [...recommendedConfig]
```

See [the ESLint docs](./eslint/README.md).

## Credits and license

Foldkit's design and APIs are by [Devin Jameson](https://github.com/foldkit/foldkit).
ReactFoldkit is MIT © Rody Gosset; Foldkit portions © Devin Jameson.
See [LICENSE](./LICENSE) and [third-party notices](./THIRD-PARTY-NOTICES.md).
