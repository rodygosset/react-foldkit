# Record a change

Add a changeset when package users will notice your change. Tests and internal changes need none.

1. Run `bun run changeset` and select only `react-foldkit`.
2. Pick `patch` for a compatible fix. Pick `minor` for a feature or a breaking change, since the package is before 1.0.
3. Write what changed and why users care, following [the writing guide](../docs/writing.md). For a breaking change, give the steps to upgrade.

[The release procedure](../docs/releasing.md) turns changesets into the changelog.
