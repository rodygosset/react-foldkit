import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
import path from "node:path"

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const hashing = (value) => createHash("sha256").update(value).digest("hex")
const writeLock = process.argv.includes("--write-lock")
const applyPatches = process.argv.includes("--apply")

// Each copy names its npm release, upstream directory, and checked source patches.
// The recorder's Clear patch uses the live Model as the next history baseline.
const copies = [
	{
		vendorRoot: "src/store/vendor",
		packageName: "foldkit",
		version: "0.168.0",
		upstreamRoot: "dist",
		includes: () => true,
		patches: new Map([
			["runtime/managedResourceFibers.d.ts", [["./resourceProvider.js", "../../managedResources.js"]]],
		]),
	},
	{
		vendorRoot: "src/devtoolsVendor",
		packageName: "foldkit",
		version: "0.168.0",
		upstreamRoot: "dist",
		includes: () => true,
		patches: new Map([
			["devTools/protocol.js", [["../schema/index.js", "foldkit/schema"]]],
			[
				"devTools/store.js",
				[
					["../struct/index.js", "foldkit/struct"],
					[
						"entries: () => [],\n                startIndex:",
						"entries: () => [],\n                maybeInitModel: () => state.maybeLatestModel,\n                initCommands: () => [],\n                initMountStarts: () => [],\n                startIndex:",
					],
					[
						"keyframes: () => Option.match(state.maybeInitModel,",
						"keyframes: () => Option.match(state.maybeLatestModel,",
					],
					["                maybeLatestModel: () => state.maybeInitModel,\n", ""],
				],
			],
			["devTools/summarize.js", [["../schema/index.js", "foldkit/schema"]]],
		]),
	},
	{
		vendorRoot: "src/vite/vendor",
		packageName: "@foldkit/vite-plugin",
		version: "0.28.0",
		upstreamRoot: "dist",
		includes: (relative) => relative.endsWith(".js") || relative.endsWith(".d.ts"),
		patches: new Map(),
		// devToolsRelay.ts and devToolsPlugin.ts adapt these without Foldkit's reload and SSR plugins.
		// A changed hash means the adaptation needs review against the new upstream source.
		adaptedFrom: ["index.js", "devToolsOverlay.js"],
	},
]

function files(directory, relative = "") {
	const result = []
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const next = path.join(relative, entry.name)
		if (entry.isDirectory()) result.push(...files(path.join(directory, entry.name), next))
		else result.push(next)
	}
	return result
}

function check({ vendorRoot, packageName, version, upstreamRoot, includes, patches, adaptedFrom = [] }) {
	const vendorDirectory = path.join(packageRoot, vendorRoot)
	const installed = path.join(packageRoot, "node_modules", packageName)
	const metadata = JSON.parse(readFileSync(path.join(installed, "package.json"), "utf8"))
	if (metadata.version !== version) throw new Error(`Expected ${packageName} ${version}, found ${metadata.version}`)
	const problems = []
	const lock = []
	for (const relative of files(vendorDirectory).sort()) {
		if (relative === "vendorLock.json" || relative === "README.md" || !includes(relative)) continue
		const destination = readFileSync(path.join(vendorDirectory, relative), "utf8")
		const upstreamPath = path.join(installed, upstreamRoot, relative)
		let upstream
		try {
			upstream = readFileSync(upstreamPath, "utf8")
		} catch {
			upstream = undefined
		}
		if (upstream === undefined) {
			problems.push(`${vendorRoot}/${relative}: no upstream source in ${packageName} ${version}`)
			continue
		}
		const expected = (patches.get(relative) ?? []).reduce(function (source, [from, to]) {
			if (!source.includes(from)) throw new Error(`${vendorRoot}/${relative}: patch source no longer matches`)
			return source.replaceAll(from, to)
		}, upstream)
		if (applyPatches) writeFileSync(path.join(vendorDirectory, relative), expected)
		lock.push({ path: relative, sourceSha256: hashing(upstream), patchedSha256: hashing(expected) })
		if (!applyPatches && destination !== expected)
			problems.push(`${vendorRoot}/${relative}: differs from upstream plus recorded patches`)
	}
	if (problems.length > 0) throw new Error(problems.join("\n"))
	const lockPath = path.join(vendorDirectory, "vendorLock.json")
	const adapted = []
	for (const relative of adaptedFrom)
		adapted.push({
			path: relative,
			sourceSha256: hashing(readFileSync(path.join(installed, upstreamRoot, relative), "utf8")),
		})
	const record = { package: packageName, version, files: lock, ...(adapted.length > 0 && { adaptedFrom: adapted }) }
	if (writeLock) {
		writeFileSync(lockPath, `${JSON.stringify(record, null, 2)}\n`)
		return `Wrote source and patched SHA-256 records for ${lock.length} ${packageName} files.`
	}
	const recorded = JSON.parse(readFileSync(lockPath, "utf8"))
	if (JSON.stringify(recorded) !== JSON.stringify(record))
		throw new Error(`${vendorRoot}/vendorLock.json does not match the upstream source, patch set, and copied files`)
	return `Verified ${lock.length} ${packageName} ${version} files with ${patches.size} recorded patch sets.`
}

for (const copy of copies) process.stdout.write(`${check(copy)}\n`)
