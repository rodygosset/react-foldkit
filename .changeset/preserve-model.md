---
"react-foldkit": minor
---

Add `preserveModel()` to `react-foldkit/vite`. Editing the module that calls `Application.define` used to remount its Provider during development, so the Model started again from `init`. With the plugin, the Provider keeps its React identity across reloads, starts the new Program from the live Model, and skips init Commands that already ran. If the live Model no longer decodes with the new `Model` Schema, the Provider starts from `init`. A Provider remounted for any other reason, such as a `key` change, still starts from `init`. As in Foldkit, Commands running at the moment of the reload stop and don't run again.
