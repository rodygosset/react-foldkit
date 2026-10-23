---
"react-foldkit": minor
---

Support Foldkit Managed Resources on Programs and Stores. Import `ManagedResource` from `foldkit` and pass its records as `managedResources` alongside `update` and `subscriptions`.

The Store acquires resources from Model requirements, provides their live values to Commands and Subscriptions, and releases them when requirements change or the activation ends. Registered resource services no longer require an additional `resources` Layer. The host still supplies other services.

React activation, reactivation, and `retainInactive` own managed resources with the same lifetime as the Store's live work. Server rendering acquires nothing. Shutdown stops Commands and Subscriptions before releasing managed resources and static services.
