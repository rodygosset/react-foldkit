# react-foldkit

React bindings for a Foldkit-style TEA program: one Model, pure `update`, Commands
for effects, optional Subscriptions for standing orders. Built on [Foldkit](https://foldkit.dev),
[Effect](https://effect.website/) and [React](https://react.dev/).

This package is **not** Foldkit. It is a React-shaped binding that reuses
Foldkit’s vocabulary (Command, Message, Update, Struct, AsyncData, Subscription,
and related Schema helpers) and implements its own store + Provider on top.

Learn the mental model at [foldkit.dev](https://foldkit.dev). For Elm/Effect
architecture background, see Foldkit’s [manifesto](https://foldkit.dev/get-started/manifesto).

## Credits

Design and TEA vocabulary credit belongs to [Foldkit](https://github.com/foldkit/foldkit)
by Devin Jameson. Foldkit is installed as a regular dependency and React Foldkit
reexports the vocabulary used by React applications.

- Foldkit: [https://foldkit.dev](https://foldkit.dev) · [GitHub](https://github.com/foldkit/foldkit)
- Third-party license notices: see [`THIRD-PARTY-NOTICES.md`](./THIRD-PARTY-NOTICES.md)
- This package: MIT — see [`LICENSE`](./LICENSE)

## Never import `foldkit` from app code

Apps should depend on `react-foldkit` (or the published package name)
only. The package manager installs Foldkit transitively; application code uses
the stable `react-foldkit/*` facade rather than importing Foldkit directly.

```tsx
import { ReactFoldkit } from "react-foldkit"
import { defineMessageUnion } from "react-foldkit/message"
```

## Package surface

| Export                                                       | Role                                                              |
| ------------------------------------------------------------ | ----------------------------------------------------------------- |
| `./react`                                                    | `make({ Model, update, … })` → `Provider` (`init`), `Seed`, `useModel`, `useDispatch` |
| `./store`                                                    | `boot()` and `takeWhen()` for tests and non-React hosts           |
| `./query`                                                    | Remote-data Submodel factory (`Query.define`, watch, forget, `run`) |
| `./command`, `./message`, `./update`, `./struct`, `./schema` | TEA vocabulary (`defineMessageUnion`, `Update.foldChild`, …)      |
| `./asyncData`                                                | Remote data helpers (`settle`, `revalidate`, …)                   |
| `./subscription`                                             | Model-gated standing orders (`Subscription.make`)                 |
| `./eslint`                                                   | Recommended + strict ESLint presets                               |

## Quick start

```tsx
import { Schema } from "effect"
import { defineMessageUnion } from "react-foldkit/message"
import { ReactFoldkit } from "react-foldkit"
import { evo } from "react-foldkit/struct"
import type * as Update from "react-foldkit/update"

const Model = Schema.Struct({ count: Schema.Number })
type Model = typeof Model.Type

const Message = defineMessageUnion({
	Increment: {},
})
type Message = typeof Message.Type

const update = (model: Model, message: Message): Update.Return<Model, Message> =>
	Message.match<Update.Return<Model, Message>>(message, {
		Increment: () => ({ model: evo(model, { count: (n) => n + 1 }) }),
	})

const { Provider, useModel, useDispatch } = ReactFoldkit.make({ Model, update })

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

See `apps/web` in this monorepo for Todo (AsyncData), Stopwatch (Subscription),
API Cache (hand-rolled AsyncData), and API Cache Query (`Query.define`).

## Query watch, forget, and run

`Query.define` is a remote-data Submodel. Keyed `Model` is a `HashMap` of
`{ args, data }` slots. Read `data` with `query.read(model, args)`. Keyed
`args` fields are `Schema.Codec`s (no encoding or decoding services). Omit
`toKey` to JSON-encode args with `Schema.toCodecJson` and
`Schema.fromJsonString`. Slot key and Interrupt identity share `toKey`.
`Query.HttpApi.Service.query` uses the same default for a keyed endpoint.

`query.lift` returns a callable parent handle. Bind the parent Model in a
`Got*` handler (`GotPostsMessage: foldPosts(model)`). The bound function takes
`{ message: childMessage }`, the same fields as `query.ParentMessage`. Call
`foldPosts(model, { message })` when you already have those fields. Policy Steps
hang on the same function (`foldPosts.revalidateOrLoad(model)`). Declare the
parent case with `query.ParentMessage`
(`GotPostsMessage: postsQuery.ParentMessage`) and pass the constructor as
`toParentMessage` (`toParentMessage: Message.GotPostsMessage`).
For an always-present slot, call
`lift<Model, Message>()({ field: "posts", toParentMessage: Message.GotPostsMessage })`.
Name both parent types so the handle is the full parent Message union, not only the
`Got*` variant the constructor returns.
A full `read` / `write` lens still infers `ParentModel` from `read` and takes
Foldkit's `(childMessage) => parentMessage` mapper.
`foldPosts.watchSubscription(entry, modelToArgs)` reuses that lift's
`toParentMessage`.

`informWatch` / `RequestedWatch` is the full live key set. The Message payload is
a `HashMap` of `toKey` to args. `informWatch` still takes an array of args.
Missing keys `loadIfMissing`. Extras run the same forget path as `informForget`,
including Interrupt of a pending Fetch. Per-key start/stop Messages are not used.
Foldkit `switchMap` on subscription deps cannot report removals. A late
`SettledFetch` does not resurrect a forgotten slot.

`Query.run` (Field) is an `Effect` that runs `execute` and returns settled
`AsyncData` via `Effect.result` + `AsyncData.settle`. Keyed `run(args)` does the
same for one slot. Neither writes into a store; callers that seed HashMap slots
build them from the settled value.

`watchSubscription` is one Foldkit `Subscription.make` entry, not a React hook.

## Seed

`Seed` writes a full Model into the inactive Provider store before `activate`,
so SSR and first paint see preloaded data. Equivalent Models (via
`Schema.toEquivalence`) are a no-op. Seeding after the store is active throws.

```tsx
const { Provider, Seed, useModel } = ReactFoldkit.make({ Model, update })

<Provider init={{ model: empty }}>
  <Seed model={preloaded}>
    <View />
  </Seed>
</Provider>
```

## Server rendering

`Provider` renders its init Model on the server (or the Seed Model when Seed
runs during the render). Commands, Subscriptions, and Layer resources start only
after client hydration, so the client must receive the same Model that produced
the server HTML. Dispatches while the live runtime is disconnected are ignored.

Init Commands belong to the Provider instance. Each runs until it produces its
result once; an interrupted init Command restarts when React reconnects Effects,
while completed init Commands do not. Subscriptions and Layer resources reconnect
with each Effect activation.

`make` takes a `Store.Config` plus `Model: Schema.Codec`. Applications that
preload on the server should pass that Model into `Seed`.

## ESLint

```js
import { recommendedConfig } from "react-foldkit/eslint"

export default [...recommendedConfig]
```

Details: [`eslint/README.md`](./eslint/README.md).

## License

MIT © Rody Gosset. Foldkit portions © Devin Jameson — see
[`THIRD-PARTY-NOTICES.md`](./THIRD-PARTY-NOTICES.md).
