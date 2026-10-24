# Use React Foldkit

Follow these rules when you write application code with React Foldkit.

## Import from the right package

- Import Messages, Commands, `Update`, `AsyncData`, and Query from `foldkit`.
- Import the React bindings, Stores, Programs, and Submodels from `react-foldkit`.

## Keep state in the Model

- Keep updates pure, and never mutate a Model. Return Commands for side effects.
- Keep application state in the Model. State that only one component uses can stay in React.
- Define the application outside React render. Its Provider owns the Store and the Store's resources.
- Use Submodels for child features. A Submodel shares its parent's Store. Unmounting a child doesn't cancel its Commands.
- Keep the server and client Models the same, so hydration matches.

## Provide services

- Declare resources that follow the Model, such as a socket that exists while a field is set, with Foldkit's `ManagedResource.make` on the Program's `managedResources`. A registered resource supplies its own service.
- Supply every other Effect service through the `resources` option.
- Read an HttpApi client service inside a Query's `execute` Effect.
- Resetting a Query clears its cached data and ignores late responses. It doesn't stop requests already sent.

## Set up the tools

- Use the ESLint preset, and configure React's hook rules separately.
- Test React views with Foldkit Scene. Export `bindSceneView(App, Component)` as the feature's `view`, and import Scene steps from `react-foldkit/scene`. Once the view moves to Foldkit, change that import to `foldkit/scene`.
- For DevTools, pass Foldkit's `devTools` settings in `Application.define`'s options, and add `devTools()` from `react-foldkit/vite` to the Vite config.
- Add `preserveModel()` from `react-foldkit/vite` to the Vite config, so editing an application module during development keeps its Model.

## Read more

- [Build a counter with Commands](docs/examples.md)
- [The API reference](docs/reference.md)
- [How the runtime works](docs/architecture.md)
- [ESLint setup](eslint/README.md)
