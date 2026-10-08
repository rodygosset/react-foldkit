# Architecture

React Foldkit hosts Foldkit's Model, Message, Update, Command, and Subscription vocabulary in React. Query belongs to Foldkit. Import Query directly from `foldkit/experimental/query`.

## Lifecycle ownership

| Owner            | Allocates                                                   | Preserves across reactivation                                                           | Releases                                                   |
| ---------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Store execution  | FIFO queue, Command and Subscription fibers, service scopes | Nothing. Each activation creates a new Store.                                           | Pending Messages, fibers, subscriptions, and services      |
| React activation | Leases on a live Store                                      | Last Model, completed init Command markers, retained crash, and initial server snapshot | The live Store after its last lease ends                   |
| Provider session | Source connection, health snapshot, and error observers     | Bootstrap and successful delivery tokens in its connection                              | Source subscription, activation lease, and observer fibers |

`Store.make` allocates a Store in the caller's Scope. `Store.boot` gives imperative hosts a synchronous constructor. Call its effectful `dispose` to release that Store.

The React activation layer holds the Model after its last lease ends. Interrupted init Commands can restart on a later activation. Completed init Commands do not repeat. The server snapshot stays fixed for hydration, while live snapshots follow Model updates. `onReactivate` supplies a Message for replacement activations to reconcile pending work through update.

ProviderSession owns source reconciliation and error reporting. A source failure can recover after successful reconciliation. A Store crash is terminal for that Store. Error observer failures are logged separately and do not replace the Cause rendered by the Provider.

Submodel Providers project one parent Store. They supply child context and lift child Messages into the parent update. They do not create another execution engine.

## Source organization

Each larger module has a curated `public.ts`. The existing flat source files forward to these modules, so consumer import paths stay the same.

| Source directory   | Responsibility                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| `src/store`        | Store types and execution, subscription fibers, and browser scheduling                           |
| `src/react`        | Application and Submodel bindings, snapshot projection, activation leases, and Provider sessions |
| `src/loader`       | Loader declarations, envelopes, resource keys, and the existing Query bridge                     |
| `src/commitSource` | Source contracts and scoped reconciliation                                                       |
| `src/internal`     | Foldkit interrupt compatibility and init Command completion tracking                             |

Store queue draining, synchronous commits, crash transitions, and disposal stay together in `store/store.ts`. Scheduling and subscription execution have separate modules. The implementations continue to use Effect Scope, Fiber, Layer, PubSub, Deferred, and Semaphore for resource ownership and coordination.

## Public imports

| Import                                                       | Responsibility                                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `react-foldkit`                                              | Namespace exports for the library and curated Foldkit vocabulary                 |
| `react-foldkit/react`                                        | Application and Submodel Providers, selectors, dispatch, commit, and projections |
| `react-foldkit/store`                                        | Store construction and lifecycle for imperative and Effect hosts                 |
| `react-foldkit/command`, `message`, `update`, `subscription` | Curated Foldkit composition helpers and side-effect descriptions                 |
| `react-foldkit/struct`, `asyncData`                          | Foldkit data helpers and remote-data states                                      |
| `react-foldkit/schema`                                       | Existing Foldkit Schema convenience reexports, available through this subpath    |
| `react-foldkit/loader`, `react-foldkit/commitSource`         | Loading transport and committed snapshot integration                             |
| `react-foldkit/tanstack`                                     | Optional TanStack Router adapter                                                 |

The root and direct vocabulary imports expose the same upstream helpers. Full vocabulary namespaces reexport Foldkit directly in the root. This preserves wildcard exports when the build shares chunks between entry points. Query remains a direct Foldkit import. TanStack and ESLint integrations stay on separate subpaths and use optional peers. Keep public exports explicit when changing a concept module. Internal implementation files are not package exports.

For API examples and lifecycle contracts, read the [package README](../packages/react-foldkit/README.md). For checks, read [Maintaining React Foldkit](maintaining.md). Earlier proposals and recorded validation results live in [history](history/README.md).

## Delivery identity

A CommitSource snapshot contains keyed, versioned Messages. Its connection acknowledges a token only after successful commit. A repeated key and version does not redeliver. Removing a key removes its acknowledgement, so reintroducing that key can deliver again.

Loader resource keys identify the data being loaded. Receipt versions identify individual deliveries and do not order outcomes by freshness. Your update decides whether incoming data is newer, using the domain revision and the freshness policy passed to `Loader.settleQueryIf`.
