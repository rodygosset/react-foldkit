# Project cache

This example shares project data between TanStack routes and React views. Route loaders populate a Query Model in one application Provider. Refresh buttons use Query Commands, and update accepts only newer revisions.

The source uses a fixed project response so you can follow the data flow without a server.

## Follow the data

1. `src/entities/project/model/query.ts` defines the keyed Query.
2. `src/entities/project/api/loader.ts` derives its Loader.
3. `src/pages/projectDetails/api/load.ts` loads a project and returns an envelope.
4. `src/app/providers/provider.tsx` connects route data to the application Provider.
5. `src/app/model/application.ts` settles the Query and handles refresh Messages.
6. `src/entities/project/ui/provider.tsx` exposes the projected Query Model to views.

## Check the example

From the repository root, build the library and typecheck the example against its public exports.

```sh
bun run --filter=react-foldkit build
bun run --filter=react-foldkit test:types:example
```

This directory contains source composition, not a standalone runnable project. It has no package manifest or Vite setup. The runnable demo app is [apps/web](../../../../apps/web).
