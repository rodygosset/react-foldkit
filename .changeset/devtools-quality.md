---
"react-foldkit": patch
---

Time travel keeps the live Store running. A Message sent while the view is paused is ignored, and `commit` returns success. DevTools history limits follow Foldkit's own limits. The dev server closes the DevTools relay when Vite shuts down.
