# Shared project Query

TanStack Start example using Feature-Sliced Design. Routes and app composition
live in `src/app`; lower slices use public indexes and do not import the app.

The loader derives serialization and identity with `Loader.fromQuery(query)`
and returns a Schema-encoded envelope. One root Provider stores accepted
results in a shared Query Model; project views read it through a projection.
Refresh uses Query Commands. Update rejects older/equal revisions before
settlement. Static `Effect.succeed` data keeps the example self-contained.

Use `src/app/router.tsx` as the Start entry. `tsr.config.json` sets the route
directory and generated tree paths. Supply the Start/Vite setup and styling,
then visit `/projects/website`.

From `packages/react-foldkit`, run:

```sh
bun run build
bun run test:types:example
```

The example uses emitted `react-foldkit/*` exports, with no source imports or
fixture-only router declarations.

See also `examples/site-notice` for a `Loader.define` path with no Query.
