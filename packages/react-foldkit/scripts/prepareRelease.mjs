import { parse } from "./json.mjs"
import { mkdirSync, rmSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import { Effect, Schema } from "effect"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const output = resolve(root, "../../.release")
class ReleaseError extends Schema.TaggedError()("ReleaseError", { message: Schema.String }) {}

const program = Effect.sync(function () {
	mkdirSync(output, { recursive: true })
	const packed = spawnSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", output], {
		cwd: root,
		encoding: "utf8",
		env: { ...process.env, npm_config_cache: join(output, ".npmCache") },
	})
	if (packed.status !== 0)
		throw new ReleaseError({ message: packed.stderr || packed.error?.message || "npm pack failed" })
	const [report] = parse(Schema.NonEmptyArray(Schema.Struct({ filename: Schema.String })), packed.stdout)
	const tarball = join(output, report.filename)
	const checked = spawnSync(process.execPath, [join(root, "scripts/testConsumer.mjs"), tarball], {
		cwd: root,
		stdio: "inherit",
	})
	if (checked.status !== 0) {
		rmSync(tarball, { force: true })
		throw new ReleaseError({ message: "Consumer checks failed. The release tarball was removed." })
	}
	return tarball
}).pipe(Effect.flatMap((tarball) => Effect.log("Prepared " + tarball)))

await Effect.runPromise(program)
