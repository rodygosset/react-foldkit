# Use React Foldkit

Import Messages, Commands, `Update`, `AsyncData`, and Query from `foldkit`. Import React bindings, Stores, and Submodels from `react-foldkit`.

- Keep updates pure and Model snapshots immutable. Return Commands for side effects.
- Create the application outside React render. Let its Provider own the Store and its resources.
- Use Submodels for child features. They share the parent Store. Unmounting a child does not cancel its Commands.
- Keep application state in the Model. Component-only state can stay in React.
- Supply Effect services through `resources`. Read an HttpApi client service inside Query's `execute` Effect.
- Resetting a Query clears cached data and ignores late responses. It does not abort requests.
- Keep server and client snapshots consistent for hydration.
- Use the ESLint preset and configure React's hook rules separately.

Read the [counter tutorial](docs/examples.md), [API reference](docs/reference.md), [runtime explanation](docs/architecture.md), and [ESLint setup](eslint/README.md).
