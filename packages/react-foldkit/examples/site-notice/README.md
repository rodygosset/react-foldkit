# Site notice (`Loader.define`)

TanStack Start example using Feature-Sliced Design. Sibling of `project-cache`,
but the payload comes from `Loader.define` with **no Query module**.

The page loader runs a thin `Loader.load(Effect.succeed(...))` Effect. The app
registry maps the decoded notice into a flat `CompletedLoadNotice` root Message.
Update writes `Option.some(notice)` into the Model. There is no `settleIfLoad`
and no entity Submodel. The page reads the root Model through Application hooks.

Use `src/app/router.tsx` as the Start entry. Visit `/`.

From `packages/react-foldkit`, run:

```sh
bun run build
bun run test:types:example
```

The example uses emitted `react-foldkit/*` exports, with no source imports.
