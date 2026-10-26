# Verify changes

Run these checks from the repository root before you push. They build the package, test its behavior, and compile sample apps against the published types. Set up the workspace first, as [Work on this repository](../README.md#work-on-this-repository) describes.

## Check every change

```sh
bun run check
```

This one command does all of the following:

- Builds the library.
- Type-checks the workspace and a sample consumer.
- Runs the unit and package tests. These include the conformance suite, which runs the same Programs on the Store and on Foldkit's runtime.
- Runs the linters. The [repository lint guide](../eslint/README.md) explains the rules.
- Type-checks the project-cache example.
- Checks the generated API docs and the API record.

To check one thing, run `bun run --filter=react-foldkit typecheck`, `test`, or `lint`. A typecheck alone is not enough for a change that affects runtime behavior. Run the tests too.

## Check a release candidate

Install Chromium once, then run the release checks:

```sh
bun run --filter=react-foldkit browser:install
bun run check:release
```

On top of `bun run check`, this:

- Runs the browser tests with an empty cache.
- Builds the web app.
- Packs React Foldkit and installs it, with the official Foldkit release, into two fresh npm apps. One app has no ESLint, and the other installs ESLint and checks the plugin's rules. Both compile with their own TypeScript and `skipLibCheck: false`, and both check the packed docs and their links.

CI runs the packed-app checks again on Node.js 20.19.0. A separate CI job runs the tests against the newest Foldkit release.

To save a tested tarball, run `bun run release:prepare`. None of these commands publish anything. To publish, follow [the release procedure](releasing.md).

## Update the API docs

After you change a public API or its JSDoc, rebuild and regenerate the reference:

```sh
bun run --filter=react-foldkit build
bun run --filter=react-foldkit docs:generate
bun run --filter=react-foldkit check:docs
bun run --filter=react-foldkit check:api
```

Review the generated diff. Don't regenerate the API record only to make a failing check pass.

The checks compile the project-cache example, but not the code blocks in Markdown files. When you change a Markdown snippet, compile it yourself against the built package.
