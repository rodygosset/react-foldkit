# Changelog

## 0.1.0

First experimental release.

- React Providers and hooks for Foldkit programs.
- Scoped Stores with Commands, Subscriptions, and crash cleanup.
- Submodels that share the parent Store.
- React Activity support and server snapshots for hydration.
- ESLint presets for application code.

The package is ESM-only. It uses official Foldkit 0.168.0 and Effect 4.0.0.

Breaking changes may occur in minor releases. Query resets ignore late responses but do not abort requests.
