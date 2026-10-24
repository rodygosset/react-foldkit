# React Foldkit ESLint presets

These presets catch two kinds of mistakes in React Foldkit apps: side effects that run outside Commands, and components that create their own Store. They use ESLint's flat config and ship with `react-foldkit`.

## Turn on the preset

Install ESLint 9, then add the preset to `eslint.config.js`:

```js
import { recommendedConfig } from "react-foldkit/eslint"

export default [...recommendedConfig]
```

Configure React's hook rules separately. These presets don't include them.

## What the rules report

The recommended preset turns on these rules. `no-inline-submodel-lift` is a warning, and the rest are errors.

| Rule | Reports | Why |
| --- | --- | --- |
| `no-navigate-outside-commands` | Navigation outside a Command or an allowed URL bridge file | Navigation is a side effect, so it belongs in a Command. |
| `no-nested-store` | `Store.boot` or an application Provider inside a view | Start the Store once, at the feature root. |
| `no-effect-run-outside-commands` | `Effect.run*` outside a Command, the Store, a test, or an allowed host file | Side effects belong in Commands, where the Store runs and stops them. |
| `no-store-hooks-in-child-view` | Store hooks in a child view that already gets `dispatch` through props | A child view should take everything through props. |
| `no-inline-submodel-lift` | A Submodel lift built during render | A new lift on each render gives the child a new source, so its views subscribe again every time. |

`strictConfig` adds one warning. `no-domain-use-state` reports `useState` and `useReducer` in views, because app state belongs in the Model. For state only one component uses, such as whether a menu is open, disable the rule on that line and say why.

The rules follow imports and aliases inside a file. They don't follow reexports from other files.

## Allow host files

Some files run Effects or bridge browser navigation on purpose, such as a router or a test setup. List them in the settings. `commandPaths` replaces the default list, so include the test and Store paths you still need:

```js
import { recommendedConfig } from "react-foldkit/eslint"

export default [
  ...recommendedConfig,
  {
    settings: {
      "react-foldkit": {
        urlBridgePaths: ["**/router.tsx"],
        commandPaths: ["**/host.ts", "**/store.ts", "**/store.*.ts", "**/*.test.ts", "**/vitest.setup.ts"],
      },
    },
  },
]
```
