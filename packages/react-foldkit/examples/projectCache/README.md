# Project cache

This example loads project data once and shares it between TanStack routes and React views. It shows a keyed Query, which caches one result per project id, inside one application Provider.

Opening a project route sends a Message, and `update` loads that project through the Query. Refresh buttons use Query Commands. If React Activity interrupts a fetch, the fetch starts again when the view comes back.

The project data is a fixed response, so you can follow the flow without a server.

## Follow the data

1. `src/entities/project/query.ts` defines the keyed Query.
2. `src/app/routes/projects.$projectId.tsx` sends `OpenedProject` when the route shows a project.
3. `src/app/application.ts` puts the Query in the application Model, loads projects it doesn't have yet, and handles refresh Messages.
4. `src/app/provider.tsx` renders the application Provider and the project Submodel Provider.
5. `src/entities/project/provider.tsx` gives views the project part of the Model.

## Check the example

This folder holds source files only, with no package manifest or Vite setup. To run a demo, use [apps/web](../../../../apps/web).

To type-check the example against the package's public exports, run from the repository root:

```sh
bun run --filter=react-foldkit build
bun run --filter=react-foldkit test:types:example
```
