import { readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { Data, Effect } from "effect"

class FilenameError extends Data.TaggedError("FilenameError") {}

const packageRoot = new URL("../", import.meta.url)
const ignoredDirectories = new Set(["node_modules", "dist", "coverage", "build"])
const standardFilenames = new Set(["THIRD-PARTY-NOTICES.md"])
const filenamePattern = /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z0-9_$]+)*$/

function checkDirectory(directory, relative = "") {
	const failures = []
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue
		if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue
		const path = relative + entry.name
		if (!standardFilenames.has(entry.name) && !filenamePattern.test(entry.name)) failures.push(path)
		if (entry.isDirectory()) {
			failures.push(...checkDirectory(new URL(entry.name + "/", directory), path + "/"))
		}
	}
	return failures
}

const check = Effect.sync(() => checkDirectory(packageRoot).sort()).pipe(
	Effect.flatMap((failures) =>
		failures.length > 0
			? Effect.fail(
					new FilenameError({
						message:
							"Use camelCase or PascalCase for package files and directories:\n" + failures.join("\n"),
					})
				)
			: Effect.log("Package filenames passed in " + fileURLToPath(packageRoot))
	)
)

await Effect.runPromise(check)
