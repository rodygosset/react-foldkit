# Release react-foldkit

Run every command from the repository root, with Node.js 24 and Bun 1.3.14. The examples use `0.1.0`. Change the version for later releases.

## 1. Set the version

The changelog for `0.1.0` is already written. For a later release:

1. Make sure every user-facing change has a changeset. To add one, run `bun run changeset` and select only `react-foldkit`. Use `patch` for a compatible fix and `minor` for a feature or a breaking change before 1.0.
2. Run `bun run version:packages`. It sets the version and writes the changelog from the changesets.
3. Point the versioned GitHub links in the package docs at the new tag.
4. Run `bun install` to update the lockfile.
5. Review the version, the changelog, the links, and the lockfile. Commit and push them.

Continue on a clean `main`. `git status --short` should print nothing.

## 2. Build and test the tarball

```sh
bun install --frozen-lockfile
bun run --filter=react-foldkit browser:install
bun run release:prepare
```

`release:prepare` runs the release checks and coverage, saves a tarball in `.release`, and installs that exact file in fresh npm apps to test it. To see which files the tarball contains:

```sh
tar -tzf .release/react-foldkit-0.1.0.tgz
```

## 3. Publish

1. Log in with `npm login --registry=https://registry.npmjs.org/`.
2. Check the account with `npm whoami`.
3. In your npm account settings, verify your email and turn on two-factor authentication.
4. Publish the tarball you tested:

```sh
npm publish .release/react-foldkit-0.1.0.tgz --access public --tag latest
```

## 4. Finish

1. Install `react-foldkit@0.1.0` in a fresh React app and run the README counter.
2. Tag the release and push the tag:

```sh
git tag v0.1.0
git push origin v0.1.0
```

3. Create a GitHub Release for the tag, with the changelog entry as its notes.
4. Announce the release once the fresh app works.

For later releases, set up [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) with GitHub Actions, so CI can publish without a personal login.
