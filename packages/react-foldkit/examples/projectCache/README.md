# Project cache

This example shares project data between TanStack routes and React views. Opening a project route sends a Message, and update loads the project through a keyed Query in one application Provider. Refresh buttons use Query Commands, and fetches that React Activity interrupted restart on reactivation.

The source uses a fixed project response so you can follow the data flow without a server.

## Follow the data

1. `src/entities/project/query.ts` defines the keyed Query.
2. `src/app/routes/projects.$projectId.tsx` sends `OpenedProject` when the route shows a project.
3. `src/app/application.ts` lifts the Query into the application Model, loads missing projects, and handles refresh Messages.
4. `src/app/provider.tsx` renders the application Provider and the project Submodel Provider.
5. `src/entities/project/provider.tsx` exposes the projected Query Model to views.

## Check the example

From the repository root, build the library and typecheck the example against its public exports.

```sh
bun run --filter=react-foldkit build
bun run --filter=react-foldkit test:types:example
```

This directory contains source composition, not a standalone runnable project. It has no package manifest or Vite setup. The runnable demo app is [apps/web](../../../../apps/web).
