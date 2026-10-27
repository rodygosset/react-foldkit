# Changelog

## 0.1.0

First experimental release. React Foldkit runs Foldkit Programs inside React, so a React app can move to Foldkit one feature at a time.

### Run a Program in React

- `Application.define` from `react-foldkit/application` takes a Program and returns a Provider with `useModel`, `useSend`, and `useInbound` hooks.
- `Program.make` from `react-foldkit/program` groups a feature's Model, Message union, `init`, `update`, and Subscriptions without React.
- `useSend()` returns one function per Message tag, so `send.ChangedTitle({ title })` builds and dispatches the Message.
- `useModel(selector)` re-renders only when the selection changes. It compares plain objects and arrays field by field, so a selector that builds new objects for 1,000 items costs about 66 µs per Model change.
- Messages must be tagged. Build them with `defineMessageUnion` from `foldkit/message`.

### Share one Store across features

- Each Provider owns a scoped Store that runs Commands and Subscriptions and cleans up after a crash.
- `Submodel.define` gives a child feature its own hooks while it shares the parent Store. A Submodel Provider accepts `optionalLift` and `fallback` for a child stored in an `Option`.
- Programs and Stores accept Foldkit's `managedResources`. The Store acquires each resource while the Model needs it, and releases it after Commands and Subscriptions stop.
- `Store.make` and `Store.boot` from `react-foldkit/store` run a Program outside React.
- Providers support React Activity and server snapshots for hydration. Server rendering acquires no resources.

### Develop with Vite and Foldkit's DevTools

- `devTools()` from `react-foldkit/vite` loads Foldkit's DevTools panel and MCP relay. Install `@foldkit/devtools` to use it, and pass Foldkit's `DevToolsConfig` as the `devTools` option of `Application.define`.
- Each Provider records its own history. Time travel renders a past Model while the live Store keeps running.
- DevTools code stays out of production bundles unless the app loads `react-foldkit/devtools`.
- `preserveModel()` from `react-foldkit/vite` keeps the live Model when you edit the module that calls `Application.define`.

### Test React views with Foldkit Scene

- `bindSceneView` from `react-foldkit/scene/react` turns a React component into a Scene view.
- `react-foldkit/scene` reexports Foldkit's Scene API and runs bound React views on the same runner. When a feature's view moves to Foldkit, the test changes only its import, to `foldkit/scene`.
- React views produce no Foldkit Mounts, so `Mount` steps and `toHaveHook` do not apply to them.

### Lint application code

- `react-foldkit/eslint` has presets that keep state, side effects, and navigation in the Program.

### Requirements

The package is ESM-only and needs Node.js 20.19 or later. It requires `foldkit` 0.169, `effect` 4, and `react` 19.2.6 or later. `@foldkit/devtools` 0.169 and `eslint` 9 are optional.

Breaking changes may occur in minor releases before 1.0. Query resets ignore late responses but do not abort requests.
