# Repository lint rules

These ESLint rules keep code style consistent across the repository's source, tests, and tools. They are separate from [the ESLint presets that React Foldkit publishes](../packages/react-foldkit/eslint/README.md) for apps.

## Write functions the same way

| Function | Syntax |
| --- | --- |
| A helper or callback that only returns an expression | An arrow with an expression body: `(item) => item.id` |
| A helper, React component, or hook with a block body | A function declaration: `function View() { … }` |
| An inline callback with a block body | An anonymous function expression: `function () { … }` |
| A callback passed to a React effect hook | A named function expression: `function syncTitle() { … }` |
| An object member with a block body | Method syntax: `{ start() { … } }` |

Keep generators and accessors as they are. Keep any function that needs `this`, `arguments`, or `new.target` in the syntax that provides it.

The rules live in `function-style.mjs` and `function-style.config.mjs`. Run `bun run test:lint` to test them.

## Run the linters

`bun run lint` runs these rules, Oxlint, and each workspace's lint command. Oxlint fails on warnings. It skips dependencies, the vendored `repos` folder, generated route trees, and build output.

`@effect/tsgo` adds Effect's checks to TypeScript and Oxlint. `bun run prepare` reinstalls its patches. Run `bun run lint:effect` to see the package's Effect diagnostics on their own.

## Why there is a TypeScript 6 shim

The workspace compiles with TypeScript 7, but the ESLint parser and the declaration bundler still need TypeScript 6's compiler API. `ts6-register.mjs` provides it, and the scripts that need it load it through `NODE_OPTIONS`. Remove the shim once those tools support TypeScript 7.
