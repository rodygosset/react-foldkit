import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const dist = join(dirname(fileURLToPath(import.meta.url)), "../../dist")

// Reads an entry and every chunk it imports, the files a bundler pulls in for that entry.
function loadedSource(entry: string, seen = new Set<string>()): string {
	if (seen.has(entry)) return ""
	seen.add(entry)
	const source = readFileSync(join(dist, entry), "utf8")
	const chunks = Array.from(source.matchAll(/from\s*['"]\.\/([^'"]+)['"]|import\s*['"]\.\/([^'"]+)['"]/g), (match) =>
		String(match[1] ?? match[2])
	)
	return source + chunks.map((chunk) => loadedSource(chunk, seen)).join("\n")
}

describe("built bundles", function () {
	it("keeps the DevTools store out of the application entry", function () {
		expect(loadedSource("devtools.js")).toContain("createDevToolsStore")
		expect(loadedSource("application.js")).not.toContain("createDevToolsStore")
	})
})
