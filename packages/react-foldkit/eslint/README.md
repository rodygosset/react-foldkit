# `react-foldkit/eslint`

Flat ESLint presets that encode react-foldkit TEA boundaries.

## Install

```bash
bun add -d eslint@^9
```

Peer: `eslint` `^9`. Import the preset from the same package — no separate plugin install.

## Usage

```js
// eslint.config.js
import { recommendedConfig } from "react-foldkit/eslint"
// or: import { strictConfig } from 'react-foldkit/eslint'

export default [
	...recommendedConfig,
	// ...your other configs
]
```

### `recommendedConfig` (errors)

Fails CI on:

| Rule                             | Catches                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------- |
| `no-navigate-outside-commands`   | `useNavigate`, `.navigate(`, `history.push` / `replace` outside `execute`     |
| `no-nested-store`                | `Store.boot` / `boot(` in Views; `<Provider>` inside `function View`          |
| `no-effect-run-outside-commands` | `Effect.run*` in `.tsx` / `update` exports outside `execute`                  |
| `no-store-hooks-in-child-view`   | `useDispatch` / `useModel` / `useStore` when props already include `dispatch` |

### `strictConfig` (recommended + warn)

Adds `no-domain-use-state` — `useState` / `useReducer` in View-named files (`**/View*.tsx`, `**/*View.tsx`, …) or functions named `View` / `*View`. Domain state belongs in the Model; disable only for local UI ephemera and leave a reason.

## Settings

```js
{
  settings: {
    'react-foldkit': {
      // Allow navigation APIs in these files (URL bridge modules).
      urlBridgePaths: ['**/router.tsx', '**/url-bridge.ts'],
      // Extra allowlist for Effect.run* (defaults already cover store + tests).
      commandPaths: ['**/store.ts', '**/store.*.ts', '**/*.test.ts', '**/vitest.setup.ts'],
    },
  },
}
```

Prefer adding a path glob to `urlBridgePaths` / `commandPaths` over `eslint-disable`. If you need a disable, you probably need a new glob.
