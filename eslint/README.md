# Function syntax

The shared configuration defines the project's function-style rules, plus the hook and
React component declaration rules. Unrelated architecture rules are not included.

- Expression-only helpers and callbacks use expression-bodied arrows.
- Helpers with block bodies use `function name() { … }` declarations.
- Inline block callbacks use anonymous `function () { … }` expressions.
- Block callbacks to `useEffect`, `useLayoutEffect`, and `useInsertionEffect`
  use named function expressions.
- Object functions use arrow properties for expression-only returns and method
  shorthand for block bodies. Class methods keep method syntax.
- React components and custom hooks use function declarations with block bodies.
- Generator functions keep generator syntax.
- Accessors and functions that use their own `this`, `arguments`, or `new.target`
  keep function/method syntax so conversions preserve receiver and call behavior.
  These are narrow correctness exceptions to the expression-return
  rule; they are covered by regression tests.

`bun run lint` checks all maintained JavaScript and TypeScript, including tests,
examples, shared UI, the ESLint implementation, and build configuration, then runs
the workspace's existing lint checks. Workspace lint commands also load the
shared rules. Vendored repositories, dependencies, generated router trees, and
build/cache/coverage output are excluded. Shared UI has no function-style waiver.

Run the rule regression tests separately with `bun run test:lint`. The full lint
command also runs them before checking repository code.

The rules live in `function-style.mjs`; the shared configuration is
`function-style.config.mjs`. Keep repository conventions here rather than in the
published React Foldkit ESLint recommendations.

## Relationship to oxlint

Effect-native linting lives in oxlint (`.oxlintrc.json`, `@effect/tsgo`
recommended and effect-native presets). All 22 Effect-native rules also run in
the editor through each workspace's TypeScript plugin configuration. The root
lint command checks all maintained files and fails on warnings. oxlint cannot
run custom JS rules, so the six
function-shape rules above stay in this minimal ESLint setup while oxlint owns
everything else. Per-file Effect rule waivers also live in `.oxlintrc.json`
`overrides`, each with a reason; inline `@effect-diagnostics` and
`eslint-disable` comments do not suppress `effecttsgo` rules under oxlint.

Negative type fixtures disable `floatingEffect` and `missingEffectContext` in
their TypeScript config because the examples intentionally leave Effects unused
or omit required services. All Effect-native rules remain enabled there.

## TypeScript side-by-side

The workspace compiler is TypeScript 7 (required by `@effect/tsgo`), but
`@typescript-eslint/parser` hard-crashes on TS >= 7, which ships no JS compiler
API. `ts6-register.mjs` preloads the `typescript6` alias (TypeScript 6.0.3) into
the parser via the require cache; lint scripts opt in with
`NODE_OPTIONS="--import ./eslint/ts6-register.mjs"` (relative to the package
directory), including the `tsup` DTS build. Delete the shim and the alias when
typescript-eslint supports TS >= 7.1.

## Patching after install

`effect-tsgo patch --typescript --oxlint` (the `scripts.prepare` hook) enables
the Effect rules in TypeScript and oxlint. Bun runs this hook during installation.
To reapply the patch manually, run `bun run prepare`; without the oxlint patch,
linting fails closed with `Unknown plugin: 'effecttsgo'`.
