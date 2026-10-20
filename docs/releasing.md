# Release react-foldkit

Use Node.js 24 and Bun 1.3.14. Run commands from the repository root.

## Prepare the version

The first release is `0.1.0`. Its changelog is already written.

For later releases:

1. Run `bun run changeset` for each change that affects users. Select only `react-foldkit`.
2. Use `patch` for compatible fixes. Use `minor` for features or breaking changes before 1.0.
3. Run `bun run version:packages` when the changes are ready to release.
4. Update versioned GitHub links in the package docs to the new tag.
5. Run `bun install` to update the lockfile. Review the version, changelog, links, and lockfile.

Commit and push the release files. Start the next steps on clean `main`. Check `git status --short` for uncommitted files.

## Prepare the package

1. Install dependencies with `bun install --frozen-lockfile`.
2. Install Chromium with `bun run --filter=react-foldkit browser:install`.
3. Run `bun run release:prepare`.

The command runs the release checks and coverage. It saves a tarball in `.release` and tests that exact file in fresh npm consumers.

For `0.1.0`, inspect the files with:

```sh
tar -tzf .release/react-foldkit-0.1.0.tgz
```

## Publish the package

1. Run `npm login --registry=https://registry.npmjs.org/`.
2. Confirm the account with `npm whoami`.
3. Verify your email and enable two-factor authentication in your npm account settings.
4. Publish the tested file:

```sh
npm publish .release/react-foldkit-0.1.0.tgz --access public --tag latest
```

Change the version in these commands for later releases. Use the tested tarball from `.release`.

## Finish the release

1. Install `react-foldkit@0.1.0` in a fresh React app and run the README counter.
2. Create and push the matching Git tag:

```sh
git tag v0.1.0
git push origin v0.1.0
```

3. Create a GitHub Release for the tag. Use the current changelog entry as its notes.
4. Announce the release after the fresh app works.

For later releases, set up [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) with GitHub Actions.
