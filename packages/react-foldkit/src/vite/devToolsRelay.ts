import { ConfigProvider, Effect, Exit, Layer, Option, Schema } from "effect"
import {
	Event as DevToolsEvent,
	EventFrame,
	RELAY_RECORD_VERSION,
	RequestFrame,
	Response,
	ResponseFrame,
	type RelayRecord,
} from "foldkit/devtools-protocol"
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto"
import { createServer as createHttpServer, type Server as HttpServer } from "node:http"
import type { IncomingMessage } from "node:http"
import type { Duplex } from "node:stream"
import * as NodeChildProcessSpawner from "@effect/platform-node-shared/NodeChildProcessSpawner"
import * as NodeCrypto from "@effect/platform-node-shared/NodeCrypto"
import * as NodeFileSystem from "@effect/platform-node-shared/NodeFileSystem"
import * as NodePath from "@effect/platform-node-shared/NodePath"
import type { Plugin, ViteDevServer } from "vite"
import { WebSocket, WebSocketServer } from "ws"

import { publishRelayRecord, retireRelayRecord } from "./vendor/relayRegistry.js"
import { relayRegistryTrust } from "./vendor/relayRegistryTrust.js"

const RELAY_PATH = "/__foldkit/devtools-mcp"
const LOOPBACK_HOST = "127.0.0.1"
const TOKEN_PARAMETER = "token"
const CHALLENGE_HEADER = "x-foldkit-relay-challenge"
const CLIENT_PROOF_HEADER = "x-foldkit-relay-client-proof"
const SERVER_PROOF_HEADER = "X-Foldkit-Relay-Server-Proof"
const HEX_256_PATTERN = /^[0-9a-f]{64}$/
const REGISTRY_LAYER = Layer.provideMerge(
	NodeChildProcessSpawner.layer,
	Layer.mergeAll(NodeFileSystem.layer, NodePath.layer, NodeCrypto.layer)
)
const decodeEventFrame = Schema.decodeUnknownExit(EventFrame)
const decodeResponseFrame = Schema.decodeUnknownExit(ResponseFrame)
const decodeRequestFrame = Schema.decodeExit(Schema.fromJsonString(RequestFrame))
const encodeResponseFrame = Schema.encodeUnknownSync(Schema.fromJsonString(ResponseFrame))

type ConnectedRuntime = {
	readonly connectionId: string
	readonly sequence: number
	readonly runtime: {
		readonly connectionId: string
		readonly title: string
		readonly url: string
	}
}

type Relay = {
	readonly id: string
	readonly httpServer: HttpServer
	readonly webSocketServer: WebSocketServer
	readonly recordDirectory: string
	readonly state: RelayState
}

type RelayState = {
	readonly runtimes: Map<string, ConnectedRuntime>
	readonly clients: Set<WebSocket>
	nextSequence: number
}

const runRegistryEffect = <A, E>(effect: Effect.Effect<A, E>): Promise<A> =>
	Effect.runPromise(
		effect.pipe(
			Effect.provide(REGISTRY_LAYER),
			Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv())
		)
	)

const sendJson = function (client: WebSocket, frame: ResponseFrame): void {
	if (client.readyState === WebSocket.OPEN) {
		client.send(encodeResponseFrame(frame))
	}
}

const sendError = (client: WebSocket, id: string, reason: string): void =>
	sendJson(client, {
		id,
		response: Response.ResponseError({ reason }),
	})

const decodeFrame = <A>(exit: Exit.Exit<A, unknown>, label: string): Option.Option<A> =>
	Exit.match(exit, {
		onFailure(cause) {
			console.warn(`[react-foldkit:devtools] rejected malformed ${label}`, cause)
			return Option.none()
		},
		onSuccess: Option.some,
	})

const handleRuntimeEvent = function (server: ViteDevServer, state: RelayState, data: unknown): void {
	const maybeFrame = decodeFrame(decodeEventFrame(data), "runtime event frame")
	if (Option.isNone(maybeFrame)) return

	DevToolsEvent.match(maybeFrame.value.event, {
		EventConnected({ runtime }) {
			const connected: ConnectedRuntime = {
				connectionId: runtime.connectionId,
				sequence: state.nextSequence++,
				runtime,
			}
			state.runtimes.set(runtime.connectionId, connected)
			server.config.logger.info(
				`[react-foldkit:devtools] runtime connected: ${runtime.connectionId} (${runtime.title})`
			)
		},
		EventDisconnected({ connectionId }) {
			state.runtimes.delete(connectionId)
			server.config.logger.info(`[react-foldkit:devtools] runtime disconnected: ${connectionId}`)
		},
	})
}

const handleRuntimeResponse = function (state: RelayState, data: unknown): void {
	const maybeFrame = decodeFrame(decodeResponseFrame(data), "runtime response frame")
	if (Option.isNone(maybeFrame)) return
	const payload = encodeResponseFrame(maybeFrame.value)
	for (const client of state.clients) {
		if (client.readyState === WebSocket.OPEN) client.send(payload)
	}
}

const handleRelayRequest = function (
	server: ViteDevServer,
	state: RelayState,
	client: WebSocket,
	raw: Buffer | ArrayBuffer | Buffer[]
): void {
	const maybeFrame = decodeFrame(
		decodeRequestFrame(
			Buffer.isBuffer(raw) ? raw.toString() : Array.isArray(raw) ? Buffer.concat(raw).toString() : Buffer.from(raw).toString()
		),
		"MCP request frame"
	)
	if (Option.isNone(maybeFrame)) return

	const frame = maybeFrame.value
	if (frame.request._tag === "RequestListRuntimes") {
		const runtimes = [...state.runtimes.values()]
			.sort((left, right) => left.sequence - right.sequence)
			.map(({ runtime }) => runtime)
		sendJson(client, {
			id: frame.id,
			response: Response.ResponseRuntimes({ runtimes }),
		})
		return
	}

	const maybeConnectionId = Option.match(frame.maybeConnectionId, {
		onNone: () => undefined,
		onSome: (connectionId) => connectionId,
	})
	if (maybeConnectionId !== undefined && !state.runtimes.has(maybeConnectionId)) {
		sendError(
			client,
			frame.id,
			`No connected Foldkit Runtime has the id ${maybeConnectionId}. Call foldkit_list_runtimes for the current ids.`
		)
		return
	}

	const request = Schema.encodeUnknownSync(RequestFrame)(frame)
	server.ws.send("foldkit:devTools:request", request)
}

const computeProof = (token: string, role: "client" | "server", challenge: string): string =>
	createHmac("sha256", token).update(`${role}:${challenge}`).digest("hex")

const presentsToken = function (url: URL, token: string): boolean {
	const presented = url.searchParams.get(TOKEN_PARAMETER)
	if (presented === null) return false
	const expectedBytes = Buffer.from(token)
	const presentedBytes = Buffer.from(presented)
	return expectedBytes.length === presentedBytes.length && timingSafeEqual(expectedBytes, presentedBytes)
}

const presentsProof = function (request: IncomingMessage, token: string): boolean {
	const challenge = request.headers[CHALLENGE_HEADER]
	const proof = request.headers[CLIENT_PROOF_HEADER]
	if (
		typeof challenge !== "string" ||
		!HEX_256_PATTERN.test(challenge) ||
		typeof proof !== "string" ||
		!HEX_256_PATTERN.test(proof)
	)
		return false
	return timingSafeEqual(Buffer.from(computeProof(token, "client", challenge), "hex"), Buffer.from(proof, "hex"))
}

const refuseUpgrade = function (socket: Duplex, status: 400 | 401 | 404): void {
	const reason = status === 400 ? "Bad Request" : status === 401 ? "Unauthorized" : "Not Found"
	socket.on("error", () => socket.destroy())
	socket.once("finish", () => socket.destroy())
	socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
}

const createRelay = async function (server: ViteDevServer, state: RelayState): Promise<Relay> {
	const id = randomUUID()
	const token = randomBytes(32).toString("hex")
	const httpServer = createHttpServer(function (_request, response) {
		response
			.writeHead(426, {
				Connection: "Upgrade",
				Upgrade: "websocket",
				"Content-Type": "text/plain",
				"Content-Length": Buffer.byteLength("Upgrade Required"),
			})
			.end("Upgrade Required")
	})
	const webSocketServer = new WebSocketServer({ noServer: true })

	webSocketServer.on("connection", function (client) {
		state.clients.add(client)
		client.on("message", (raw) => handleRelayRequest(server, state, client, raw))
		client.on("close", () => state.clients.delete(client))
		client.on("error", (error) =>
			server.config.logger.warn(`[react-foldkit:devtools] MCP client error: ${error.message}`)
		)
	})
	webSocketServer.on("headers", function (headers, request) {
		const challenge = request.headers[CHALLENGE_HEADER]
		if (typeof challenge === "string" && HEX_256_PATTERN.test(challenge)) {
			headers.push(`${SERVER_PROOF_HEADER}: ${computeProof(token, "server", challenge)}`)
		}
	})
	httpServer.on("upgrade", function (request, socket, head) {
		let url: URL
		try {
			url = new URL(request.url ?? "/", "http://relay")
		} catch {
			refuseUpgrade(socket, 400)
			return
		}
		if (url.pathname !== RELAY_PATH) {
			refuseUpgrade(socket, 404)
		} else if (!presentsToken(url, token) && !presentsProof(request, token)) {
			refuseUpgrade(socket, 401)
		} else {
			webSocketServer.handleUpgrade(request, socket, head, function (client) {
				webSocketServer.emit("connection", client, request)
			})
		}
	})

	await new Promise<void>(function (resolveListen, rejectListen) {
		httpServer.once("error", rejectListen)
		httpServer.listen(0, LOOPBACK_HOST, function () {
			httpServer.off("error", rejectListen)
			resolveListen()
		})
	})

	const address = httpServer.address()
	if (address === null || typeof address === "string") {
		httpServer.close()
		webSocketServer.close()
		throw new Error("The DevTools relay did not bind a TCP port")
	}
	const relayUrl = new URL(`ws://${LOOPBACK_HOST}:${address.port}${RELAY_PATH}`)
	relayUrl.searchParams.set(TOKEN_PARAMETER, token)
	const record: RelayRecord = {
		version: RELAY_RECORD_VERSION,
		id,
		root: server.config.root,
		url: relayUrl.toString(),
		pid: process.pid,
		startedAt: Date.now(),
	}
	try {
		const recordDirectory = await runRegistryEffect(publishRelayRecord(record, relayRegistryTrust))
		server.config.logger.info(
			`[react-foldkit:devtools] MCP relay listening at ws://${LOOPBACK_HOST}:${address.port}${RELAY_PATH}`
		)
		return { id, httpServer, webSocketServer, recordDirectory, state }
	} catch (cause) {
		for (const client of webSocketServer.clients) client.terminate()
		webSocketServer.close()
		httpServer.close()
		server.config.logger.warn(
			`[react-foldkit:devtools] MCP relay discovery failed; continuing without the relay: ${String(cause)}`
		)
		throw cause
	}
}

const closeRelay = async function (relay: Relay): Promise<void> {
	await runRegistryEffect(retireRelayRecord(relay.id, relay.recordDirectory)).catch(() => undefined)
	for (const client of relay.webSocketServer.clients) client.terminate()
	await new Promise<void>(function (resolveClose) {
		relay.httpServer.close(() => resolveClose())
		relay.webSocketServer.close()
	})
}

/** Starts and owns the browser-to-MCP relay for a Vite development server. */
export const devToolsRelayPlugin = function (): Plugin {
	const relays = new WeakMap<object, Promise<Relay | undefined>>()

	return {
		name: "react-foldkit:devtools-relay",
		apply: "serve",
		async configureServer(server) {
			if (server.config.mode === "test") return
			const state: RelayState = { runtimes: new Map(), clients: new Set(), nextSequence: 0 }
			server.ws.on("foldkit:devTools:event", (data) => handleRuntimeEvent(server, state, data))
			server.ws.on("foldkit:devTools:response", (data) => handleRuntimeResponse(state, data))
			const relay = createRelay(server, state).catch(function (cause) {
				server.config.logger.error(`[react-foldkit:devtools] MCP relay failed to start: ${String(cause)}`)
				return undefined
			})
			relays.set(server.config, relay)
			await relay
		},
		async closeBundle() {
			const relayPromise = relays.get(this.environment.getTopLevelConfig())
			if (relayPromise === undefined) return
			relays.delete(this.environment.getTopLevelConfig())
			const relay = await relayPromise
			if (relay !== undefined) await closeRelay(relay)
		},
	}
}
