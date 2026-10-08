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

`Loader.fromQuery(query)` derives its payload Codec from the Foldkit Query's
Model. Keyed `Load` payloads contain `{ args, result }`; plain Queries contain
`{ result }`. Arguments keep their own namespace, so names such as `args` and
`result` remain valid. Loader derives a JSON codec with `Schema.toCodecJson` from
the supplied schema. Pass native schemas such as `Schema.Option` and
`Schema.HashMap` directly. The supplied schema must support that conversion,
including nested Query argument, success, and error schemas. Transformed codecs
keep their declared JSON representation. Envelopes carry `Schema.Json` payloads;
decoding restores the schema's application values.
`loadQuery` executes and encodes the bound Query in the host's Effect runtime.
Constructing a keyed loading Effect does not invoke the Query's execute callback.

```ts
const loader = Loader.fromQuery(query)

// Optional delivery identity overrides; no repeated Schemas.
const namedLoader = Loader.fromQuery(query, {
  name: "ProjectDetails",
  key: ({ projectId }) => projectId,
})
```

The default name is `query.Fetch.name` (for example, `"FetchProject"`). Keyed
resource keys use canonical JSON of Schema-encoded arguments; plain Queries use
`"singleton"` and take no `key` override, because they have no arguments to key on.
A key override receives decoded arguments, not the fetched result. Loader delivery
identity is independent of Query's cache identity. Names must be unique within a
registry.

In update, read `load.args` and `load.result` and use
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

Use `createCommitSource` to derive the registry inside the Provider:

```tsx
import { Cause } from "effect"
import * as Loader from "react-foldkit/loader"
import * as TanStackSource from "react-foldkit/tanstack"

function Root() {
	return (
		<Application.Provider
			init={App.init()}
			createCommitSource={() => TanStackSource.make(router, [
				Project.loader.pipe(Loader.mapMessages((load) => App.Message.CompletedLoadProject({ load }))),
			])}
			renderError={(cause) => <pre role="alert">{Cause.pretty(cause)}</pre>}
			onError={reportFailure}
		>
			<AppView />
		</Application.Provider>
	)
}
```

`TanStackSource.make` returns `Result<CommitSource<Message, SchemaError>, RegistryError>`.
Duplicate declaration names are typed construction failures. Provider accepts this
Result directly from the factory and handles it with the initial snapshot.
Factories and update must be pure. React may repeat initialization in Strict Mode
or abandon a render. Subscriptions start only after client activation.

Provider captures init and its source on initialization. Changing those props or
replacing the factory does not reset the Model or replace the source. Remount with
a new React key to create another instance. Existing sources can use `commitSource`
directly. Supply either `commitSource` or `createCommitSource`.

Bootstrap Messages pass through update in snapshot order and preserve Commands.
SSR/hydration reads the populated Model. Initial Messages do not replay on activation.
`renderError` receives the complete Cause for bootstrap, setup, source, and Store
failures. Its default renders a typed failure's message and a generic line for a
defect, so a stack trace never reaches the DOM. `onError` observes client failures,
including cleanup defects, and returns an `Effect<void, unknown>`. A terminal Store
crash reaches `onError` once for update, init Command, update Command, Subscription,
dispatch, and commit failures. `Store.Config.onCrash` still runs once for that crash.

Source failures recover after a successful reconciliation only while the Store is
healthy. A terminal Store crash stays visible while inactive. A fresh healthy
activation clears it; a failed replacement setup publishes its own Cause instead
of retaining the previous crash. Live source failures keep the connection and
successful delivery tokens. A later valid notification retries undelivered tokens. Setup failures
release acquired resources; remount to retry initialization. Error callbacks do not
run during SSR, but bootstrap failures render the fallback.

Live `onError` observers have a two-second cooperative deadline and belong to the
running Provider lifetime. At most four transient observers run concurrently;
overflow transient reports are dropped. A terminal Store crash starts a separate
observer, so busy transient observers cannot suppress its report. All live
observers are canceled when the lifetime stops. Stopping closes resource scopes
and logs cleanup defects before observing them with `onError`, with a five-second
cooperative deadline.
An observer Effect or finalizer that cannot be interrupted can keep cleanup waiting
beyond that deadline. Observer failures are logged and do not change the Cause
passed to `renderError`. A delayed observer cannot restore a fallback after recovery.
A fresh healthy activation clears crash deduplication, so a later crash using the
same Cause is rendered and reported again.

`useOptionalModel` and `useOptionalDispatch` return `Option` when a root or child
Provider may be absent. Root applications also expose `useOptionalCommit`.
The ordinary hooks retain their missing-Provider errors.

### Source contract

A `CommitSource<Message, E = never>` provides
`getSnapshot(): Result<ReadonlyArray<CommitEntry<Message>>, E>` and
`subscribe(notify): unsubscribe`. Use `Result.succeed(entries)` for an infallible
custom source. A snapshot that cannot be read synchronously is a contract
violation, so a read failure is typed data and a thrown value stays a defect.
Each entry has:

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

Duplicate keys and reentrant notifications produce `CommitSourceError` in the
`Result` failure channel. Reconciliation is synchronous. Snapshot and commit
defects are captured at the notification boundary; source failures reach `onError`
and keep the connection. A successful reconciliation clears a source failure only
while the Store is healthy. A terminal Store crash remains visible across source
notifications and reaches `onError` once. Catch-up failures release the connection;
disconnected callbacks do nothing. SSR does not subscribe.

`loader.decode(envelope)` returns `Result<Message, SchemaError>`. A schema
mismatch or a resource-key mismatch is a typed failure; a throwing `key` callback
or Message mapper stays a thrown defect. Use `Result.getOrThrow` where the
envelope is trusted. The TanStack adapter handles decoding for registered
declarations.

`loader.decodeDelivery(envelope)` returns `Result<Delivery<Message>, SchemaError>`.
A Delivery contains the validated `receipt` and mapped `message`. The adapter
uses this method to decode each envelope once. `decode` returns just its Message.
`Loader.mapMessages` composes those mappings through `decodeDelivery` and preserves
the Loader's name, data Codec, key, load function, and delivery receipt.
Derived resource keys keep Schema encoding failures in the typed channel;
exceptions from custom key callbacks remain defects.

`Store.make(config, init)` returns `Effect<Store<Model, Message>, never, Scope>`,
allocating a fresh store in the caller's Scope on each execution, so closing that
Scope disposes it. `Store.dispose()` returns `Effect<void>` and resolves once every
resource is released. Concurrent and later calls share its completion, including
cleanup defects. `Store.boot(config, init)` remains the synchronous entry
point for imperative hosts and owns its own Scope; dispose it with
`await Effect.runPromise(store.dispose())` so asynchronous resource finalizers
can finish. React activation uses `Store.make` through the
Provider's Scope.

Disposal notifies every listener even if an earlier listener throws. Listener
defects join the disposal result after resource cleanup. `Store.takeWhen(store,
pick)` succeeds with the first selected value or fails with `Disposed` when the
Store ends. A throwing `pick` fails the waiting Effect with a defect and
unsubscribes without crashing the Store. Interrupting the waiter also unsubscribes.

Use `Effect.runFork(store.dispose())` inside a synchronous notification callback.
A reentrant disposal waits for the cleanup already in progress and cannot use
`Effect.runSync` while that cleanup is pending.

## Server rendering and lifetimes

The server renders init with the source snapshot applied. Hydration needs
equivalent data. Commands, Subscriptions, and Layer resources start on client
activation. Disconnected dispatches are ignored.

Interrupted init Commands restart on reconnect; completed ones do not repeat.
Subscriptions and Layer resources restart with each activation.

Commands returned by later updates are interrupted when the activation ends and
are not replayed. Their Model transitions survive. Use the optional
`onReactivate: () => Message` configuration to reconcile pending work through
update when a replacement activation starts. It does not run on the first
activation or when another lease joins the current activation.

If `onReactivate` throws, activation fails and its acquired resources close. If
its Message crashes update, the replacement Store follows the ordinary terminal
crash lifecycle: `renderError` and `onError` receive the original Cause, and its
resources close when the activation ends.

For pending Query reads, the reconciliation handler can call `replace` to start
a new generation. Restart only operations that are safe to repeat. Account for
incomplete init Commands that already restart, so the handler does not start the
same read twice. The project-cache example reconciles its update-started reads.
To keep Commands running while a view is hidden, put its application Provider
outside `React.Activity` instead.

The client session activates before child layout effects and ref attachments,
so those callbacks can dispatch and commit Messages on their first mount.

`defineApplication` takes `Store.Config`, `Model: Schema.Codec`, and optional
`onReactivate`. Preload data through init or a Provider-owned commit source.

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
