# Limitations

Read this before you adopt React Foldkit. It lists what React Foldkit doesn't do today, and what that means for your app, so you can decide whether it fits.

## When it fits

React Foldkit fits a React app that wants to move to Foldkit without a rewrite. It moves the app's state and side effects into Foldkit Programs while React keeps rendering.

It fits less well in these cases:

- A new app with no React code to keep. Start with [Foldkit](https://foldkit.dev/get-started) directly.
- An app that has to stay on React for good. React Foldkit is built to be left behind, so it adds nothing beyond what Foldkit has.
- A team that can't accept breaking changes yet. See the next section.

## It is experimental

React Foldkit is at version 0.1. A minor release, such as 0.2, may break your code. The [changelog](../CHANGELOG.md) lists each change and how to upgrade. Foldkit itself is in beta, and its own minor releases can break code too.

## It needs recent versions

| Requirement                   | Version                                                               |
| ----------------------------- | --------------------------------------------------------------------- |
| React                         | `^19.2.6`                                                             |
| Foldkit                       | `^0.169.0`                                                            |
| Effect                        | `4.0.0`                                                               |
| TypeScript                    | `strict: true` and `moduleResolution: "bundler"`, tested with `7.0.2` |
| Node.js, for server rendering | `20.19.0` or newer                                                    |

The package is ESM-only, so your bundler and test runner must load ES modules. An app on React 18 or Effect 3 has to upgrade first.

## Foldkit's view features don't apply to React views

React renders the views, so the Foldkit features that belong to Foldkit's renderer aren't available in React components:

- Mounts, which hand a real DOM element to a third-party library. Use a React ref for that instead.
- Element hooks, lazy views, view memoization, and view transitions.

Scene tests can't use `Mount` steps or `toHaveHook` on React views, and the DevTools panel's Mounts tab stays empty. These features come back once a feature's view moves to Foldkit, as [Move to Foldkit](moveToFoldkit.md) describes.

## You bring your own router

React Foldkit doesn't include Foldkit's routing, because a React app already has a router. Your router owns the URL, and the Model keeps a copy of what it needs. [Use a router](routing.md) shows the pattern with TanStack Router. Foldkit's routing replaces it only when the whole app moves.

## Server rendering shows the first Model only

During server rendering, the Provider renders the Model from `init` and starts nothing. Commands, Subscriptions, and Managed Resources run only in the browser. So data that a Command loads appears after the page loads.

To show data in the server HTML, load it in your framework, such as in a route loader, and pass it to the Provider's `init`. Foldkit's own server rendering and hydration aren't used.

## Scene tests on React views have limits

Scene runs a React view in memory, not in a browser, so it reads the elements React renders:

- Components that need layout, refs to real DOM nodes, or browser APIs during render need a browser test instead.
- Timers, promises, and suspended work need an asynchronous test outside Scene.
- The view you test must render one element at its root.

[Test views with Scene](scene.md) lists what works.

## It follows Foldkit's releases closely

Foldkit doesn't export some of the parts React Foldkit needs, such as its Scene runner and its DevTools recorder. So React Foldkit runs copies of them, pinned to the Foldkit release it was tested with. The checks fail when a copy no longer matches that release.

For your app, this means a new Foldkit release may need a matching React Foldkit release before you upgrade Foldkit. `@foldkit/devtools`, if you use it, must stay on the same minor version, `~0.169.0`.

## Child Providers don't own work

A child Provider from `Submodel.define` reads its part of the parent's Model and runs nothing itself. Unmounting a child's React component doesn't cancel the Commands it started. The parent's `update` has to handle late results, as [Give child Programs their own hooks](submodels.md) shows.
