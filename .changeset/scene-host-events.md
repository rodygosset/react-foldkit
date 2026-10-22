---
"react-foldkit": patch
---

Scene drains passive `setState` chains before the next step, and `Application` exposes `SceneSourceTypeId`.

- A `useEffect` that calls `setState` more than once is visible to the next Scene step. Scene still stops after 100 renders.
- An error thrown while rendering fails that `scene()` call with the same error. That includes a render caused by `setState` inside a click.
- `Application` from `Application.define` includes `SceneSourceTypeId`, the React context Scene uses to read the model. In development, Scene freezes the model passed to a bound view, matching the Provider.
