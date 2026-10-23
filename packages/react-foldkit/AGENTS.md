# Use React Foldkit

Import Messages, Commands, `Update`, `AsyncData`, and Query from `foldkit`. Import React bindings, Stores, and Submodels from `react-foldkit`.

- Keep updates pure and Model snapshots immutable. Return Commands for side effects.
- Create the application outside React render. Let its Provider own the Store and its resources.
- Use Submodels for child features. They share the parent Store. Unmounting a child does not cancel its Commands.
- Keep application state in the Model. Component-only state can stay in React.
- Declare Model-driven resources with Foldkit's `ManagedResource.make` on the Program's `managedResources`. Registered resource tags supply their own services. Supply remaining Effect services through `resources`. Read an HttpApi client service inside Query's `execute` Effect.
- Resetting a Query clears cached data and ignores late responses. It does not abort requests.
- Keep server and client snapshots consistent for hydration.
- Use the ESLint preset and configure React's hook rules separately.
- Test React views with Foldkit Scene: export `bindSceneView(App, Component)` as the feature's `view` and import Scene steps from `react-foldkit/scene`. After the view moves to Foldkit, change that import to `foldkit/scene`.
- For DevTools, pass Foldkit's `devTools` settings to `Application.define`'s options and add `devTools()` from `react-foldkit/vite` to the Vite config.

Read the [counter tutorial](docs/examples.md), [API reference](docs/reference.md), [runtime explanation](docs/architecture.md), and [ESLint setup](eslint/README.md).
