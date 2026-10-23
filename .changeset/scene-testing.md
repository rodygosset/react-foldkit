---
"react-foldkit": minor
---

Add `react-foldkit/scene` and `react-foldkit/scene/react` for testing React views with Foldkit Scene.

- `bindSceneView(App, Component)` from `react-foldkit/scene/react` turns a component that uses `App.useModel()` and `App.useSend()` into a Scene view. Export it as the feature's `view`.
- `react-foldkit/scene` exports Foldkit's Scene API. Its `scene` runs Foldkit views on Foldkit's runner and bound React views on a copy of that runner, so Command, Subscription, ManagedResource, OutMessage, and ignored-interaction steps work unchanged. When a feature's view moves to Foldkit, change the test import to `foldkit/scene`.
- React views produce no Foldkit Mounts or element hooks, so `Mount` steps and `toHaveHook` do not apply to them.
