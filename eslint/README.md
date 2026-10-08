# Repository lint conventions

The shared ESLint rules keep function syntax consistent across maintained source, tests, and tooling. These repository conventions are separate from the published [React Foldkit architecture presets](../packages/react-foldkit/eslint/README.md).

## Function syntax

- Use expression-bodied arrows for expression-only helpers and callbacks.
- Use function declarations for helpers, React components, and hooks with block bodies.
- Use anonymous function expressions for inline callbacks with block bodies. Name the callbacks passed to React effect hooks.
- Use method syntax for object functions with block bodies. Keep generators and accessors in their existing syntax.
- Preserve function syntax when `this`, `arguments`, or `new.target` requires it.

The rules live in `function-style.mjs` and `function-style.config.mjs`. Run `bun run test:lint` for their regression tests.

## Effect checks

`bun run lint` runs the shared rules, Oxlint, and workspace lint commands. Oxlint treats warnings as failures. Dependencies, vendored repositories, generated route trees, and build output are excluded.

`@effect/tsgo` supplies Effect diagnostics in TypeScript and Oxlint. `bun run prepare` reapplies their installation patches. Run `bun run lint:effect` to inspect package diagnostics directly.

The workspace uses TypeScript 7. `ts6-register.mjs` supplies the TypeScript 6 compiler API needed by the ESLint parser and declaration bundler. Relevant scripts load that shim with `NODE_OPTIONS`. Keep the alias until those tools support the workspace compiler.
