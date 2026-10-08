# React Foldkit ESLint presets

These presets catch side effects and Store ownership mistakes in React Foldkit code. They use ESLint's flat configuration and ship with `react-foldkit`.

## Configure ESLint

Install ESLint 9, then add the preset to `eslint.config.js`.

```js
import { recommendedConfig } from "react-foldkit/eslint"

export default [...recommendedConfig]
```

Use `strictConfig` instead to add warnings about local React state in Views.

## Rules

The recommended preset enables these rules as errors.

| Rule                             | Reports                                                                |
| -------------------------------- | ---------------------------------------------------------------------- |
| `no-navigate-outside-commands`   | Navigation outside Command execution or an allowed URL bridge          |
| `no-nested-store`                | Store construction or application Providers inside Views               |
| `no-effect-run-outside-commands` | Effect runners outside Command execution or allowed host files         |
| `no-store-hooks-in-child-view`   | Store hooks in child Views that already receive dispatch through props |

The strict preset also warns with `no-domain-use-state` when View components use `useState` or `useReducer`. Keep application state in the Model. Use a local disable with a reason for component-only UI state.

Rules follow imports and aliases within a module. They do not infer ownership through arbitrary local reexports. Configure React hook rules separately.

## Allow host files

Use settings for files that intentionally run Effects or bridge browser navigation. `commandPaths` replaces the default allowlist, so include test and Store paths you still need.

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
