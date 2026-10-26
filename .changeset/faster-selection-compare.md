---
"react-foldkit": patch
---

Compare selections faster. `useModel(selector)` and `useInbound` now compare plain objects and arrays field by field, without hashing them first, and leave every other value to `Equal.equals`. They re-render and send Messages in the same cases as before. A selector that builds new objects for 1,000 items spends about 66 µs per Model change instead of 1.6 ms.

One difference remains. An object marked with `Equal.byReference` inside a plain selection is now compared by its content. Pass `isEqual` if you rely on identity there.
