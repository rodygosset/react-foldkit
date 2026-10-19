import { rmSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import { Effect, Schema } from "effect"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
class BrowserTestError extends Schema.TaggedError()("BrowserTestError", {
	message: Schema.String,
	cause: Schema.optional(Schema.Defect()),
}) {}
const program = Effect.sync(function () {
	rmSync(resolve(root, "node_modules/.vite/reactFoldkitBrowser"), { recursive: true, force: true })
	const result = spawnSync("bun", ["run", "test:browser"], { cwd: root, stdio: "inherit" })
	if (result.status !== 0) throw new BrowserTestError({ message: "Cold browser tests failed", cause: result.error })
})
await Effect.runPromise(program)
