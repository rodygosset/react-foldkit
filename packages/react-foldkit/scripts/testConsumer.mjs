import { parse, stringify } from "./json.mjs"
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import { Effect, Schema } from "effect"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const manifest = parse(
	Schema.Struct({
		exports: Schema.Record(Schema.String, Schema.Struct({ types: Schema.String, import: Schema.String })),
		dependencies: Schema.Record(Schema.String, Schema.String),
		peerDependencies: Schema.Record(Schema.String, Schema.String),
		devDependencies: Schema.Record(Schema.String, Schema.String),
	}),
	readFileSync(join(root, "package.json"), "utf8")
)
const compiler = parse(
	Schema.Struct({ version: Schema.String }),
	readFileSync(resolve(root, "../../node_modules/typescript/package.json"), "utf8")
)
class ConsumerError extends Schema.TaggedError()("ConsumerError", {
	message: Schema.String,
	cause: Schema.optional(Schema.Defect()),
}) {}
function run(command, args, cwd, cache = cwd) {
	const result = spawnSync(command, args, {
		cwd,
		encoding: "utf8",
		env: {
			...process.env,
			npm_config_cache: join(cache, ".npmCache"),
		},
	})
	if (result.status !== 0)
		throw new ConsumerError({
			message: [command + " " + args.join(" "), result.stdout, result.stderr].join("\n"),
			cause: result.error,
		})
	return result.stdout
}
function pack(output) {
	const report = parse(
		Schema.NonEmptyArray(Schema.Struct({ filename: Schema.String })),
		run("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", output], root, output)
	)
	return join(output, report[0].filename)
}
function verifyExports(consumer) {
	for (const [entry, targets] of Object.entries(manifest.exports)) {
		for (const target of [targets.types, targets.import]) {
			if (!existsSync(join(consumer, "node_modules/react-foldkit", target)))
				throw new ConsumerError({ message: entry + " targets missing packed file " + target })
		}
	}
}
function verifyConsumer(directory, tarball, fixture) {
	const consumer = join(directory, fixture)
	mkdirSync(consumer)
	writeFileSync(
		join(consumer, "package.json"),
		stringify({
			name: "react-foldkit-consumer-" + fixture,
			private: true,
			type: "module",
			dependencies: {
				"react-foldkit": "file:" + tarball,
				foldkit: manifest.devDependencies.foldkit,
				effect: manifest.devDependencies.effect,
				react: manifest.devDependencies.react,
				"react-dom": manifest.devDependencies["react-dom"],
				...(fixture === "eslint" ? { eslint: manifest.devDependencies.eslint } : {}),
			},
			devDependencies: {
				typescript: compiler.version,
				"@types/react": manifest.devDependencies["@types/react"],
				"@types/react-dom": manifest.devDependencies["@types/react-dom"],
				"@types/node": "^22",
			},
		})
	)
	run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], consumer, directory)
	verifyExports(consumer)
	if (fixture === "core" && existsSync(join(consumer, "node_modules/eslint")))
		throw new ConsumerError({ message: "Core consumer unexpectedly requires ESLint" })
	copyFileSync(join(root, "test/consumer", fixture + ".ts"), join(consumer, "consumer.ts"))
	run(
		join(consumer, "node_modules/.bin/tsc"),
		[
			"--strict",
			"--skipLibCheck",
			"false",
			"--types",
			"node",
			"--module",
			"preserve",
			"--moduleResolution",
			"bundler",
			"--target",
			"ES2022",
			"--outDir",
			"compiled",
			"consumer.ts",
		],
		consumer
	)
	run("node", ["compiled/consumer.js"], consumer)
}
const program = Effect.acquireUseRelease(
	Effect.sync(() => mkdtempSync(join(tmpdir(), "reactFoldkitConsumer"))),
	(directory) =>
		Effect.sync(function () {
			for (const [name, version] of Object.entries({
				...manifest.dependencies,
				...manifest.peerDependencies,
				foldkit: manifest.devDependencies.foldkit,
			})) {
				if (/^(?:file:|link:|workspace:|git|https?:|github:)/.test(version))
					throw new ConsumerError({
						message: name + " must use an npm registry version, received " + version,
					})
			}
			const tarball = pack(directory)
			verifyConsumer(directory, tarball, "core")
			verifyConsumer(directory, tarball, "eslint")
		}),
	(directory) => Effect.sync(() => rmSync(directory, { recursive: true, force: true }))
).pipe(
	Effect.andThen(
		Effect.log("Published Foldkit consumers verified: strict declarations, namespace types, SSR, Query and ESLint")
	)
)
await Effect.runPromise(program)
