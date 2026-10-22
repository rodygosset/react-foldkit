// @vitest-environment node
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import { createServer as createNetServer } from "node:net"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createServer } from "vite"
import { afterEach, describe, expect, it } from "vitest"
import { WebSocket } from "ws"

import { devToolsPlugin } from "./devToolsPlugin.js"
import { devToolsRelayPlugin } from "./devToolsRelay.js"
import { fileURLToPath } from "node:url"

const servers: Array<Awaited<ReturnType<typeof createServer>>> = []
const registryDirectories: string[] = []
const previousRegistryDirectory = process.env["FOLDKIT_DEVTOOLS_RELAY_DIRECTORY"]

afterEach(async function () {
	await Promise.all(servers.splice(0).map((server) => server.close()))
	await Promise.all(registryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
	if (previousRegistryDirectory === undefined) {
		delete process.env["FOLDKIT_DEVTOOLS_RELAY_DIRECTORY"]
	} else {
		process.env["FOLDKIT_DEVTOOLS_RELAY_DIRECTORY"] = previousRegistryDirectory
	}
})

const openSocket = (url: string, protocol?: string): Promise<WebSocket> =>
	new Promise(function (resolveSocket, rejectSocket) {
		const socket = new WebSocket(url, protocol)
		socket.once("open", () => resolveSocket(socket))
		socket.once("error", rejectSocket)
	})

const nextJson = <A>(socket: WebSocket): Promise<A> =>
	new Promise(function (resolveFrame, rejectFrame) {
		socket.once("message", function (raw) {
			try {
				resolveFrame(JSON.parse(Buffer.isBuffer(raw) ? raw.toString() : "") as A)
			} catch (error) {
				rejectFrame(error)
			}
		})
	})

const sendViteEvent = function (socket: WebSocket, event: string, data: unknown): void {
	socket.send(JSON.stringify({ type: "custom", event, data }))
}

const findFreePort = (): Promise<number> =>
	new Promise(function (resolvePort, rejectPort) {
		const probe = createNetServer()
		probe.once("error", rejectPort)
		probe.listen(0, "127.0.0.1", function () {
			const address = probe.address()
			if (address === null || typeof address === "string") {
				probe.close()
				rejectPort(new Error("Could not determine a free port"))
			} else {
				probe.close(() => resolvePort(address.port))
			}
		})
	})

describe("DevTools MCP relay", function () {
	it("discovers runtimes, routes requests, rejects malformed frames, and cleans up", async function () {
		const registryDirectory = await mkdtemp(join(tmpdir(), "react-foldkit-vite-relay-"))
		registryDirectories.push(registryDirectory)
		process.env["FOLDKIT_DEVTOOLS_RELAY_DIRECTORY"] = registryDirectory

		const server = await createServer({
			configFile: false,
			logLevel: "silent",
			mode: "development",
			server: { host: "127.0.0.1", port: await findFreePort(), strictPort: true },
			plugins: [devToolsRelayPlugin()],
		})
		servers.push(server)
		await server.listen()

		const recordFile = (await readdir(registryDirectory)).find((name) => name.endsWith(".json"))
		expect(recordFile).toBeDefined()
		const record = JSON.parse(await readFile(join(registryDirectory, recordFile!), "utf8")) as { url: string }
		const mcp = await openSocket(record.url)
		const address = server.httpServer?.address()
		if (address === undefined || address === null || typeof address === "string") {
			throw new Error("Vite did not open its HTTP server")
		}
		const browser = await openSocket(`ws://127.0.0.1:${address.port}`, "vite-hmr")

		sendViteEvent(browser, "foldkit:devTools:event", {
			maybeConnectionId: null,
			event: {
				_tag: "EventConnected",
				runtime: {
					connectionId: "runtime-1",
					title: "Test app",
					url: "http://localhost:5173/",
				},
			},
		})

		mcp.send(
			JSON.stringify({
				id: "list-runtimes",
				maybeConnectionId: null,
				request: { _tag: "RequestListRuntimes" },
			})
		)
		const runtimeList = await nextJson<{
			id: string
			response: { _tag: string; runtimes: Array<{ connectionId: string }> }
		}>(mcp)
		expect(runtimeList).toMatchObject({
			id: "list-runtimes",
			response: { _tag: "ResponseRuntimes", runtimes: [{ connectionId: "runtime-1" }] },
		})

		mcp.send("{malformed")
		expect(mcp.readyState).toBe(WebSocket.OPEN)

		mcp.send(
			JSON.stringify({
				id: "get-model",
				maybeConnectionId: "runtime-1",
				request: { _tag: "RequestGetModel", maybePath: null, expand: true },
			})
		)
		const browserRequest = await nextJson<{
			type: string
			event: string
			data: { id: string; maybeConnectionId: string | null }
		}>(browser)
		expect(browserRequest).toMatchObject({
			type: "custom",
			event: "foldkit:devTools:request",
			data: { id: "get-model", maybeConnectionId: "runtime-1" },
		})

		sendViteEvent(browser, "foldkit:devTools:response", {
			id: "get-model",
			response: { _tag: "ResponseModel", value: { count: 1 }, atPath: "", summarized: false },
		})
		const model = await nextJson<{ id: string; response: { _tag: string } }>(mcp)
		expect(model).toMatchObject({
			id: "get-model",
			response: { _tag: "ResponseModel" },
		})

		await new Promise<void>(function (resolveClose) {
			browser.once("close", () => resolveClose())
			browser.close()
		})
		await expect
			.poll(async function () {
				const response = nextJson<{ response: { runtimes: unknown[] } }>(mcp)
				mcp.send(
					JSON.stringify({
						id: "after-close",
						maybeConnectionId: null,
						request: { _tag: "RequestListRuntimes" },
					})
				)
				return (await response).response.runtimes
			})
			.toEqual([])
		mcp.close()
		await server.close()
		servers.splice(servers.indexOf(server), 1)

		await expect(openSocket(record.url)).rejects.toBeTruthy()
		expect(await readdir(registryDirectory)).toEqual([])
		expect(server.ws.clients.size).toBe(0)
	})

	it("does not install the Foldkit full-reload HMR hook", function () {
		const plugin = devToolsRelayPlugin()
		expect(plugin.handleHotUpdate).toBeUndefined()
	})

	it("injects the published overlay entry and the React Foldkit runtime bridge", async function () {
		const registryDirectory = await mkdtemp(join(tmpdir(), "react-foldkit-vite-overlay-"))
		registryDirectories.push(registryDirectory)
		process.env["FOLDKIT_DEVTOOLS_RELAY_DIRECTORY"] = registryDirectory
		const root = fileURLToPath(new URL("./fixtures/devtools/", import.meta.url))
		const server = await createServer({
			configFile: false,
			logLevel: "silent",
			root,
			resolve: {
				alias: {
					"react-foldkit/devtools": join(root, "runtimeBridge.js"),
					"react-foldkit/application": join(root, "runtimeBridge.js"),
				},
			},
			server: { host: "127.0.0.1", port: await findFreePort(), strictPort: true },
			plugins: [devToolsPlugin()],
		})
		servers.push(server)
		await server.listen()

		const address = server.httpServer?.address()
		if (address === undefined || address === null || typeof address === "string") {
			throw new Error("Vite did not open its HTTP server")
		}
		const html = await fetch(`http://127.0.0.1:${address.port}/`).then((response) => response.text())
		expect(html).toContain("html-proxy")

		const htmlProxy = await server.transformRequest("/index.html?html-proxy&index=0.js")
		expect(htmlProxy?.code).toContain('import "/@id/__x00__virtual:react-foldkit-devtools-overlay"')

		const virtualModule = await server.transformRequest("virtual:react-foldkit-devtools-overlay")
		expect(virtualModule?.code).toContain("/node_modules/.vite/deps/@foldkit_devtools_vite")
		expect(virtualModule?.code).toContain("/runtimeBridge.js")
		expect(virtualModule?.code).toContain("__configure(overlay, import.meta.hot)")
		expect(virtualModule?.code).toContain("import.meta.hot?.dispose(dispose)")

		// Server-rendered frameworks never transform index.html, so browser modules that use React Foldkit
		// import the overlay themselves. Server-side modules do not.
		const clientModule = await server.transformRequest("/app.js")
		expect(clientModule?.code).toContain("virtual:react-foldkit-devtools-overlay")
		const serverModule = await server
			.ssrLoadModule("/app.js")
			.then(() => server.environments.ssr.transformRequest("/app.js"))
		expect(serverModule?.code).not.toContain("virtual:react-foldkit-devtools-overlay")

		// Loading the optimized overlay also lets Vite finish its dependency run, which close waits for.
		const optimizedOverlay = await server.transformRequest("/node_modules/.vite/deps/@foldkit_devtools_vite.js")
		expect(optimizedOverlay?.code).toContain("createOverlay")

		await server.close()
		servers.splice(servers.indexOf(server), 1)
		expect(await readdir(registryDirectory)).toEqual([])
	}, 20_000)
})
