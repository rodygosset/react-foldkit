# Function syntax

The shared configuration copies the function-style rules from the Recolnat
repository (`MNHN/recolnat/eslint.config.ts`). It also carries over the hook and
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
  These are narrow correctness exceptions added to the copied expression-return
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
