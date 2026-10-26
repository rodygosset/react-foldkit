# React Foldkit

React Foldkit runs [Foldkit](https://foldkit.dev) programs inside React. It lets an existing React app move to Foldkit one feature at a time. Each feature's state and side effects move into a Foldkit Program, and React keeps rendering the feature until you swap its view.

> React Foldkit is experimental. A minor release may break your code. The [changelog](packages/react-foldkit/CHANGELOG.md) lists each change and how to upgrade.

Patch releases fix bugs without breaking anything. Minor releases add features.

## Install

```sh
npm install react-foldkit foldkit@^0.169.0 effect@4.0.0 react@^19.2.6
```

## Read the docs

The docs cover only what React Foldkit adds. Programs, Messages, `update`, and Commands are Foldkit's, and [Foldkit's documentation](https://foldkit.dev/core/architecture) explains them.

| Guide                                                                           | What it covers                                                                    |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [Get started](packages/react-foldkit/README.md)                                 | What React Foldkit is, the requirements, and a first Program in React             |
| [How the Provider runs a Program](packages/react-foldkit/docs/provider.md)      | When work starts and stops, React Activity, changing props, services, and crashes |
| [Move to Foldkit](packages/react-foldkit/docs/moveToFoldkit.md)                 | Move an app from React to Foldkit, one feature at a time                          |
| [Give child Programs their own hooks](packages/react-foldkit/docs/submodels.md) | Foldkit Submodels in React components                                             |
| [Use a router](packages/react-foldkit/docs/routing.md)                          | Keep the URL and the Model in sync                                                |
| [Managed Resources](packages/react-foldkit/docs/managedResources.md)            | How Foldkit's Managed Resources run under a Provider                              |
| [Test views with Scene](packages/react-foldkit/docs/scene.md)                   | Foldkit's Scene tests for React views                                             |
| [Debug with Foldkit DevTools](packages/react-foldkit/docs/devtools.md)          | Foldkit's DevTools panel for React Providers                                      |
| [Limitations](packages/react-foldkit/docs/limitations.md)                       | What React Foldkit doesn't do today, so you can decide whether it fits            |
| [API reference](packages/react-foldkit/docs/reference.md)                       | Every import and what it guarantees                                               |

The [project-cache example](packages/react-foldkit/examples/projectCache/README.md) loads a Foldkit Query with arguments and caches its results across TanStack routes.

## Work on this repository

Use Bun 1.3.14 and Node.js 24. The workspace installs the official Foldkit package from npm.

```sh
bun install --frozen-lockfile
bun run dev --filter=web
```

The second command starts the docs site, which runs the demos under `/examples`.

| Folder                          | What it holds                                                             |
| ------------------------------- | ------------------------------------------------------------------------- |
| `packages/react-foldkit`        | The library, its ESLint plugin, its tests, and the project-cache example  |
| `apps/web`                      | The docs site, built with React Foldkit. Its demos live under `/examples` |
| `packages/ui`                   | Components and theme shared by the site                                   |
| `repos/foldkit`, `repos/effect` | Upstream source, for reference only. The build ignores it.                |

To contribute, read [how the runtime works](packages/react-foldkit/docs/architecture.md), [how to verify changes](docs/verification.md), [how to release](docs/releasing.md), and [the writing guide](docs/writing.md).
