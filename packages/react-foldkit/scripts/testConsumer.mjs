import { parse, stringify } from "./json.mjs"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import { Data, Effect, Schema } from "effect"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const manifest = parse(
	Schema.Struct({
		exports: Schema.Record(Schema.String, Schema.Unknown),
		peerDependencies: Schema.Record(Schema.String, Schema.String),
		devDependencies: Schema.Record(Schema.String, Schema.String),
	}),
	readFileSync(join(root, "package.json"), "utf8")
)
class ConsumerError extends Data.TaggedError("ConsumerError") {}
function run(command, args, cwd, cache = cwd) {
	const result = spawnSync(command, args, {
		cwd,
		encoding: "utf8",
		env: {
			...process.env,
			npm_config_cache: join(cache, ".npmCache"),
			BUN_TMPDIR: cache,
			BUN_INSTALL_CACHE_DIR: join(cache, ".bunCache"),
		},
	})
	if (result.status !== 0)
		throw new ConsumerError({
			message: [command + " " + args.join(" "), result.stdout, result.stderr].join("\n"),
			cause: result.error,
		})
	return result.stdout
}
function pack(directory, output) {
	const report = parse(
		Schema.NonEmptyArray(Schema.Struct({ filename: Schema.String })),
		run("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", output], directory, output)
	)
	return join(output, report[0].filename)
}
const program = Effect.acquireUseRelease(
	Effect.sync(() => mkdtempSync(join(tmpdir(), "reactFoldkitConsumer"))),
	(dir) =>
		Effect.sync(function () {
			const foldkit = pack(resolve(root, "node_modules/foldkit"), dir)
			const reactFoldkit = pack(root, dir)
			writeFileSync(
				join(dir, "package.json"),
				stringify({
					name: "react-foldkit-consumer",
					private: true,
					type: "module",
					dependencies: {
						"react-foldkit": "file:" + reactFoldkit,
						foldkit: "file:" + foldkit,
						effect: manifest.peerDependencies.effect,
						react: "19.2.6",
						"react-dom": "19.2.6",
						eslint: "9.39.5",
						"@types/react": "^19",
						"@types/react-dom": "^19",
						"@types/node": "^22",
						"@tanstack/react-router": manifest.devDependencies["@tanstack/react-router"],
						"@tanstack/router-core": manifest.devDependencies["@tanstack/router-core"],
						"@tanstack/react-store": manifest.devDependencies["@tanstack/react-store"],
					},
					overrides: { foldkit: "file:" + foldkit },
				})
			)
			run("bun", ["install", "--ignore-scripts"], dir)
			writeFileSync(
				join(dir, "consumer.ts"),
				`
import { strict as assert } from "node:assert"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { Effect, Option, Schema } from "effect"
import * as Foldkit from "react-foldkit"
import * as Store from "react-foldkit/store"
import * as Loader from "react-foldkit/loader"
import * as Query from "foldkit/experimental/query"
import { defineApplication } from "react-foldkit/react"
const entries: ReadonlyArray<string> = ${stringify(Object.keys(manifest.exports).map((entry) => (entry === "." ? "react-foldkit" : "react-foldkit/" + entry.slice(2))))}
const App = defineApplication({ Model: Schema.Finite, update: (model: number, message: number) => ({model: model + message}) })
function View() { return createElement("span", null, App.useModel()) }
assert.equal(renderToString(createElement(App.Provider, { init: { model: 7 }, children: createElement(View) })), "<span>7</span>")
assert.equal(typeof Foldkit.Schema.defineTaggedUnion, "function")
const query = Query.define({ name: "Packed", data: Schema.String, error: Schema.String, interrupt: true, execute: Effect.succeed("ok") })
const program = Effect.scoped(Effect.gen(function* () {
  for (const entry of entries) yield* Effect.promise(() => import(entry))
  const loader = Loader.fromQuery(query)
  const envelope = yield* Loader.loadQuery(loader)
  assert.equal(envelope.key, "singleton")
  const pending = query.loadIfMissing(query.init("consumer"))
  const store = yield* Store.make({ update: query.update }, pending)
  const data = yield* Store.takeWhen(store, (model) => Option.filter(Foldkit.AsyncData.getData(query.read(model)), (data) => data === "ok"))
  assert.equal(data, "ok")
}))
await Effect.runPromise(program)
`
			)
			run(
				resolve(root, "../../node_modules/.bin/tsc"),
				[
					"--noEmit",
					"--types",
					"node",
					"--typeRoots",
					join(dir, "node_modules/@types"),
					"--strict",
					"--skipLibCheck",
					"--module",
					"preserve",
					"--moduleResolution",
					"bundler",
					"--target",
					"ES2022",
					join(dir, "consumer.ts"),
				],
				dir
			)
			run("bun", ["consumer.ts"], dir)
		}),
	(dir) => Effect.sync(() => rmSync(dir, { recursive: true, force: true }))
).pipe(Effect.andThen(Effect.log("Packed consumer installation, declarations, SSR and interruptible Query verified")))
await Effect.runPromise(program)
