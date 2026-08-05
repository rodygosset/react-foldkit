# react-foldkit

React bindings for a Foldkit-style TEA program: one Model, pure `update`, Commands
for effects, optional Subscriptions for standing orders. Built on
[Effect](https://effect.website/) and [React](https://react.dev/).

This package is **not** Foldkit. It is a React-shaped binding that reuses
Foldkit’s vocabulary (Command, Message, Update, Struct, AsyncData, Subscription,
and related Schema helpers) and implements its own store + Provider on top.

Learn the mental model at [foldkit.dev](https://foldkit.dev). For Elm/Effect
architecture background, see Foldkit’s [manifesto](https://foldkit.dev/get-started/manifesto).

## Credits

Design and TEA vocabulary credit belongs to [Foldkit](https://github.com/foldkit/foldkit)
by Devin Jameson. Selected Foldkit modules are vendored and bundled into this
package’s published build.

- Foldkit: [https://foldkit.dev](https://foldkit.dev) · [GitHub](https://github.com/foldkit/foldkit)
- Vendored code licenses: see [`THIRD-PARTY-NOTICES.md`](./THIRD-PARTY-NOTICES.md)
- This package: MIT — see [`LICENSE`](./LICENSE)

## Never import `foldkit` from app code

Apps should depend on `@rodygosset/react-foldkit` (or the published package name)
only. Foldkit is an implementation detail compiled into `dist/` at build time.

```tsx
import { make } from "@rodygosset/react-foldkit/react"
import * as Command from "@rodygosset/react-foldkit/command"
import { m } from "@rodygosset/react-foldkit/message"
```

## Package surface

| Export | Role |
|--------|------|
| `./react` | `make()` → `Provider`, `useModel`, `useDispatch` |
| `./store` | `boot()` for tests and non-React hosts |
| `./command`, `./message`, `./update`, `./struct`, `./schema` | TEA vocabulary |
| `./asyncData` | Remote data helpers (`settle`, `revalidate`, …) |
| `./subscription` | Model-gated standing orders (`Subscription.make`) |
| `./submodel` | Nested model delegation |
| `./eslint` | Recommended + strict ESLint presets |

## Quick start

```tsx
import { Match, Schema } from "effect"
import * as Command from "@rodygosset/react-foldkit/command"
import { m } from "@rodygosset/react-foldkit/message"
import { make } from "@rodygosset/react-foldkit/react"
import * as Struct from "@rodygosset/react-foldkit/struct"

const Model = Schema.Struct({ count: Schema.Number })
type Model = typeof Model.Type

const Increment = m("Increment")
const Message = Schema.Union([Increment])
type Message = typeof Message.Type

function update(model: Model, message: Message) {
  return Match.value(message).pipe(
    Match.tagsExhaustive({
      Increment: function () {
        return [Struct.evo(model, { count: (n) => n + 1 }), Command.none]
      },
    })
  )
}

const { Provider, useModel, useDispatch } = make({ update })

function CounterView() {
  const count = useModel(function (m) {
    return m.count
  })
  const dispatch = useDispatch()

  return (
    <button type="button" onClick={function () { dispatch(Increment()) }}>
      {count}
    </button>
  )
}

export function Counter() {
  return (
    <Provider init={[{ count: 0 }, Command.none]}>
      <CounterView />
    </Provider>
  )
}
```

See `apps/web` in this monorepo for Todo (AsyncData) and Stopwatch (Subscription)
examples.

## ESLint

```js
import { recommendedConfig } from "@rodygosset/react-foldkit/eslint"

export default [...recommendedConfig]
```

Details: [`eslint/README.md`](./eslint/README.md).

## License

MIT © Rody Gosset. Foldkit portions © Devin Jameson — see
[`THIRD-PARTY-NOTICES.md`](./THIRD-PARTY-NOTICES.md).
