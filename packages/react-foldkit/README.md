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
excluded from the package output.

```tsx
import { ReactFoldkit } from "react-foldkit"
import { defineMessageUnion } from "react-foldkit/message"
```

| Entry point                                                  | API                                                                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `./react`                                                    | Application/child Providers, Model selectors, dispatch, projections, and external-source delivery |
| `./store`                                                    | Non-React hosts: boot, commit, and `takeWhen`                                                     |
| `./query`                                                    | Remote-data Submodels, policies, watch/forget, run, and external settlement                       |
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

`Query.define` creates a remote-data Submodel initialized with an instance ID.
Read it with `query.read(model)` or `keyedQuery.read(model, args)`. Instance and
request IDs reject obsolete completions.

| API                                                         | Behavior                                                                               |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `loadIfMissing`, `revalidate`, `replace`, `watch`, `forget` | Pure Model transitions that return Commands; keyed forms also take args                |
| Keyed `watch(model, argsArray)`                             | Reconciles the complete live key set                                                   |
| `watchSubscription`                                         | Emits watch Messages when dependencies change                                          |
| `query.lift`                                                | Parent fold, policy steps, and watch subscription; supports a field or read/write lens |
| `query.run` / `keyedQuery.run(args)`                        | Loading Effect without Model writes                                                    |
| `Query.HttpApi.Service.query`                               | Derives endpoint Schemas, service, and keyed args                                      |

Wrap Query Messages as `{ message: query.Message }`, pass `toParentMessage` to
`lift`, and handle them with `queryChild.fold(model, message)`.

Enable Fetch interruption with `interrupt: true`. Replacement waits for
cancellation; forgetting a pending slot interrupts it. Plain Fetches also reject
obsolete request IDs.

### External settlement

`query.settle(model, result)` and `keyedQuery.settle(model, args, result)` install
external outcomes without fetching. Lifted forms update the parent and map
interrupt Commands. All support data-last steps and need no fetch services.

Success/Failure settle the slot; other variants are ignored. Failure keeps good
data as Stale. Settlement advances request identity, clears the pending ID, and
can interrupt the old Fetch. Request-specific keys protect newer work from delayed
cancellation. Direct `Fetch.Interrupt` calls need `requestId`, instance ID, and
keyed args where applicable.

Reuse `query.Model.fields.data` or
`keyedQuery.Model.fields.slots.value.fields.data` for result Schemas. Update checks
freshness; `ROUTE_LOADER_API_SPEC.md` describes delivery.

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
changes to init do not reset the Model.

For manual connections, use `useCommitSource({ source, initialSnapshot })` beneath
the persistent Provider. Pass the exact snapshot folded into init and preserve
its Commands. Use either the prop or one hook; both would duplicate delivery.

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
