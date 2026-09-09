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

| Export                                                       | Role                                              |
| ------------------------------------------------------------ | ------------------------------------------------- |
| `./react`                                                    | `make()` → `Provider`, `useModel`, `useDispatch`  |
| `./store`                                                    | `boot()` for tests and non-React hosts            |
| `./command`, `./message`, `./update`, `./struct`, `./schema` | TEA vocabulary (`defineMessageUnion`, `Update.foldChild`, …) |
| `./asyncData`                                                | Remote data helpers (`settle`, `revalidate`, …)              |
| `./subscription`                                             | Model-gated standing orders (`Subscription.make`)            |
| `./eslint`                                                   | Recommended + strict ESLint presets                          |

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

const { Provider, useModel, useDispatch } = ReactFoldkit.make({ update })

function CounterView() {
  const count = useModel((m) => m.count)
  const dispatch = useDispatch()

  return (
    <button type="button" onClick={function () { dispatch(Message.Increment()) }}>
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

See `apps/web` in this monorepo for Todo (AsyncData) and Stopwatch (Subscription)
examples.

## Server rendering

`Provider` renders its init Model on the server. Commands, Subscriptions, and
Layer resources start only after client hydration, so the client must receive
the same init Model that produced the server HTML. Dispatches while the live
runtime is disconnected are ignored.

Init Commands belong to the Provider instance. Each runs until it produces its
result once; an interrupted init Command restarts when React reconnects Effects,
while completed init Commands do not. Subscriptions and Layer resources reconnect
with each Effect activation.

The `schema` config describes the Model but does not transfer it automatically.
Applications that preload a Model on the server must encode it into the response
and decode it with the same Schema before hydrating `Provider`.

## ESLint

```js
import { recommendedConfig } from "react-foldkit/eslint"

export default [...recommendedConfig]
```

Details: [`eslint/README.md`](./eslint/README.md).

## License

MIT © Rody Gosset. Foldkit portions © Devin Jameson — see
[`THIRD-PARTY-NOTICES.md`](./THIRD-PARTY-NOTICES.md).
