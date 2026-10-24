// @vitest-environment node
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { createServer } from "vite"
import { afterEach, describe, expect, it } from "vitest"
import { preserveModelPlugin } from "./preserveModelPlugin.js"

const servers: Array<{ close: () => Promise<void> }> = []
afterEach(async function () {
	await Promise.all(servers.splice(0).map((server) => server.close()))
})

const begin = 'globalThis[Symbol.for("react-foldkit/hot")]?.begin(import.meta.url);'
const end = ';globalThis[Symbol.for("react-foldkit/hot")]?.end();'

describe("preserveModel", function () {
	it("wraps browser modules that import React Foldkit and leaves the rest alone", async function () {
		const root = fileURLToPath(new URL("./fixtures/preserveModel/", import.meta.url))
		const server = await createServer({
			configFile: false,
			logLevel: "silent",
			root,
			resolve: { alias: { "react-foldkit/application": join(root, "application.js") } },
			server: { middlewareMode: true, ws: false },
			plugins: [preserveModelPlugin()],
		})
		servers.push(server)

		const app = await server.transformRequest("/app.js")
		expect(app?.code.startsWith(begin)).toBe(true)
		expect(app?.code).toContain(end)

		const plain = await server.transformRequest("/plain.js")
		expect(plain?.code).not.toContain("react-foldkit/hot")

		const serverModule = await server.environments.ssr.transformRequest("/app.js")
		expect(serverModule?.code).not.toContain("react-foldkit/hot")
	}, 20_000)

	it("applies only to the dev server", function () {
		expect(preserveModelPlugin().apply).toBe("serve")
	})
})
