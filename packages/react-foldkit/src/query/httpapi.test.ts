import { describe, it } from "@effect/vitest"
import { Effect, HashMap, Layer, Option, Result, Schema } from "effect"
import { HttpClient, HttpClientError, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiMiddleware, HttpApiSchema } from "effect/unstable/httpapi"
import * as HttpApiClient from "effect/unstable/httpapi/HttpApiClient"
import { expect, expectTypeOf } from "vitest"
import * as AsyncData from "../asyncData"
import * as Store from "../store"
import * as Query from "./index"

const Note = Schema.Struct({ id: Schema.String, body: Schema.String })
type Note = typeof Note.Type

class NotesAuthError extends Schema.Error<NotesAuthError>("NotesAuthError")({
	_tag: Schema.tag("NotesAuthError"),
}) {}

class NotesAuth extends HttpApiMiddleware.Service<NotesAuth>()("NotesAuth", {
	error: NotesAuthError,
	requiredForClient: true,
}) {}

const Api = HttpApi.make("Api").add(
	HttpApiGroup.make("notes")
		.add(
			HttpApiEndpoint.get("list", "/notes", {
				success: Schema.Array(Note),
				error: Schema.String,
			})
		)
		.add(
			HttpApiEndpoint.get("getById", "/notes/:id", {
				params: { id: Schema.String },
				success: Note,
				error: Schema.String,
			})
		)
		.add(
			HttpApiEndpoint.get("getByIdNonce", "/notes/:id/nonce", {
				params: { id: Schema.String },
				query: { nonce: Schema.String },
				success: Note,
				error: Schema.String,
			})
		)
		.add(
			HttpApiEndpoint.post("create", "/notes", {
				payload: Note,
				success: Note,
				error: Schema.String,
			})
		)
		.add(
			HttpApiEndpoint.get("guarded", "/notes/guarded", {
				success: Note,
				error: Schema.String,
			}).middleware(NotesAuth)
		)
		.add(HttpApiEndpoint.get("ping", "/ping"))
		.add(
			HttpApiEndpoint.get("secret", "/secret", {
				success: Schema.String as Schema.Codec<string, string, never, "SecretEncode">,
			})
		)
		.add(
			HttpApiEndpoint.get("locked", "/locked/:id", {
				params: { id: Schema.String as Schema.Codec<string, string, never, "ParamEncode"> },
				success: Note,
			})
		)
		.add(
			HttpApiEndpoint.get("decoded", "/decoded", {
				success: Schema.String as Schema.Codec<string, string, "SecretDecode">,
			})
		)
		.add(
			HttpApiEndpoint.get("events", "/events", {
				success: HttpApiSchema.StreamSse({ data: Note }),
			})
		)
		.add(
			HttpApiEndpoint.get("bytes", "/bytes", {
				success: HttpApiSchema.StreamUint8Array(),
			})
		)
		.add(
			HttpApiEndpoint.get("headerEvents", "/header-events", {
				success: HttpApiSchema.WithHeaders(HttpApiSchema.StreamSse({ data: Note }), { "x-count": Schema.Int }),
			})
		)
)

const TopLevelApi = HttpApi.make("TopLevelApi").add(
	HttpApiGroup.make("notes", { topLevel: true }).add(
		HttpApiEndpoint.get("list", "/notes", {
			success: Schema.Array(Note),
		})
	)
)

class TopLevelNotesClient extends Query.HttpApi.Service<TopLevelNotesClient>()("TopLevelNotesClient", {
	api: TopLevelApi,
}) {}

const topLevelNotes = TopLevelNotesClient.query("Notes", "notes", "list")

function jsonClient(body: unknown): HttpClient.HttpClient {
	return HttpClient.make(function (request) {
		return Effect.succeed(
			HttpClientResponse.fromWeb(
				request,
				new Response(JSON.stringify(body), {
					status: 200,
					headers: { "content-type": "application/json" },
				})
			)
		)
	})
}

class NotesClient extends Query.HttpApi.Service<NotesClient>()("NotesClient", { api: Api }) {}

type NotesApiGroups = typeof Api extends HttpApi.HttpApi<infer _I, infer G> ? G : never

const notes = NotesClient.query("Notes", "notes", "list")
const noteById = NotesClient.query("Note", "notes", "getById")
const noteByIdNonce = NotesClient.query("NoteNonce", "notes", "getByIdNonce")
const createNote = NotesClient.query("CreateNote", "notes", "create")
const guarded = NotesClient.query("Guarded", "notes", "guarded")
const ping = NotesClient.query("Ping", "notes", "ping")

const transportError = (): HttpClientError.HttpClientError =>
	new HttpClientError.HttpClientError({
		reason: new HttpClientError.TransportError({
			request: HttpClientRequest.get("/notes"),
			description: "offline",
		}),
	})

const schemaError = (): Schema.SchemaError =>
	Schema.decodeUnknownResult(Schema.Number)("nope").pipe(Result.flip, Result.getOrThrow)

const httpClientFailure = (error: HttpClientError.HttpClientError) =>
	AsyncData.Failure({
		error: Query.HttpApi.HttpApiClientError.make({
			reason: HttpClientError.HttpClientErrorSchema.fromHttpClientError(error),
		}),
	})

const schemaFailure = (error: Schema.SchemaError) =>
	AsyncData.Failure({
		error: Query.HttpApi.HttpApiClientError.make({
			reason: Query.HttpApi.SchemaError.fromSchemaError(error),
		}),
	})

const notesClient = {
	notes: {
		list: function () {
			return Effect.succeed([{ id: "1", body: "hello" }])
		},
		getById: function (request: { readonly params: { readonly id: string } }) {
			if (request.params.id === "missing") return Effect.fail("not found")
			if (request.params.id === "transport") return Effect.fail(transportError())
			if (request.params.id === "schema") return Effect.fail(schemaError())
			return Effect.succeed({ id: request.params.id, body: "hello" })
		},
		getByIdNonce: function (request: {
			readonly params: { readonly id: string }
			readonly query: { readonly nonce: string }
		}) {
			return Effect.succeed({ id: request.params.id, body: request.query.nonce })
		},
		create: function (request: { readonly payload: Note }) {
			return Effect.succeed(request.payload)
		},
		guarded: function () {
			return Effect.succeed({ id: "1", body: "hello" })
		},
		ping: function () {
			return Effect.void
		},
	},
} as unknown as HttpApiClient.Client<NotesApiGroups>

const NotesClientLive = Layer.succeed(NotesClient, notesClient)

describe("Query.HttpApi.Service.query", () => {
	it("is a Query whose run depends on the client tag", () => {
		expectTypeOf(notes).toExtend<Query.Query.Any>()
		expectTypeOf(notes.run).toEqualTypeOf<
			Effect.Effect<
				AsyncData.AsyncData<ReadonlyArray<Note>, string | Query.HttpApi.HttpApiClientError>,
				never,
				NotesClient
			>
		>()
	})

	it.effect("run uses the HttpApiClient method", () =>
		Effect.gen(function* () {
			const data = yield* Effect.provide(notes.run, NotesClientLive)
			expect(data).toEqual(AsyncData.Success({ data: [{ id: "1", body: "hello" }] }))
		})
	)

	it.effect("run uses a top-level HttpApiClient method", () =>
		Effect.gen(function* () {
			const live = Layer.effect(
				TopLevelNotesClient,
				HttpApiClient.makeWith(TopLevelApi, {
					baseUrl: "http://test",
					httpClient: jsonClient([{ id: "1", body: "hello" }]),
				})
			)
			const data = yield* Effect.provide(topLevelNotes.run, live)
			expect(data).toEqual(AsyncData.Success({ data: [{ id: "1", body: "hello" }] }))
		})
	)
})

describe("Query.HttpApi.Service.query KeyedQuery", () => {
	it("is a KeyedQuery Submodel over the client request", () => {
		expectTypeOf(noteById).toMatchTypeOf<Query.KeyedQuery.Any>()
		expectTypeOf(noteById.run).parameter(0).toEqualTypeOf<{
			readonly params: { readonly id: string }
		}>()
		expectTypeOf(createNote.run).parameter(0).toEqualTypeOf<{
			readonly payload: Note
		}>()
	})

	it.effect("run forwards params to the client method", () =>
		Effect.gen(function* () {
			const data = yield* Effect.provide(noteById.run({ params: { id: "7" } }), NotesClientLive)
			expect(data).toEqual(AsyncData.Success({ data: { id: "7", body: "hello" } }))
		})
	)

	it.effect("run settles a declared endpoint error", () =>
		Effect.gen(function* () {
			const data = yield* Effect.provide(noteById.run({ params: { id: "missing" } }), NotesClientLive)
			expect(data).toEqual(AsyncData.Failure({ error: "not found" }))
		})
	)

	it.effect("run settles HttpClientError as Failure", () =>
		Effect.gen(function* () {
			const data = yield* Effect.provide(noteById.run({ params: { id: "transport" } }), NotesClientLive)
			expect(data).toEqual(httpClientFailure(transportError()))
		})
	)

	it.effect("run settles SchemaError as Failure", () =>
		Effect.gen(function* () {
			const data = yield* Effect.provide(noteById.run({ params: { id: "schema" } }), NotesClientLive)
			expect(data).toEqual(schemaFailure(schemaError()))
		})
	)

	it.effect("run forwards payload on POST", () =>
		Effect.gen(function* () {
			const payload = { id: "9", body: "created" }
			const data = yield* Effect.provide(createNote.run({ payload }), NotesClientLive)
			expect(data).toEqual(AsyncData.Success({ data: payload }))
		})
	)

	it("distinct params keep distinct slots", () => {
		const first = noteById.informLoadIfMissing(noteById.init(), { params: { id: "a" } })
		const second = noteById.informLoadIfMissing(first.model, { params: { id: "b" } })
		expect(noteById.read(second.model, { params: { id: "a" } })).toEqual(AsyncData.Loading())
		expect(noteById.read(second.model, { params: { id: "b" } })).toEqual(AsyncData.Loading())
	})
})

describe("Query.HttpApi.Service.query extra args", () => {
	it("distinct extra args keep distinct slots and Fetch keys", () => {
		const first = noteByIdNonce.informLoadIfMissing(noteByIdNonce.init(), {
			params: { id: "a" },
			query: { nonce: "1" },
		})
		const second = noteByIdNonce.informLoadIfMissing(first.model, {
			params: { id: "a" },
			query: { nonce: "2" },
		})
		expect(HashMap.size(second.model)).toBe(2)
		expect(
			noteByIdNonce.read(second.model, {
				params: { id: "a" },
				query: { nonce: "1" },
			})
		).toEqual(AsyncData.Loading())
		expect(
			noteByIdNonce.read(second.model, {
				params: { id: "a" },
				query: { nonce: "2" },
			})
		).toEqual(AsyncData.Loading())
		expect(noteByIdNonce.Fetch({ params: { id: "a" }, query: { nonce: "1" } }).key).not.toEqual(
			noteByIdNonce.Fetch({ params: { id: "a" }, query: { nonce: "2" } }).key
		)
	})

	it.effect("forgetting one extra-arg slot leaves the sibling client call running", () =>
		Effect.gen(function* () {
			const attempts: Record<string, number> = {}
			const client = {
				notes: {
					...notesClient.notes,
					getByIdNonce: function (request: {
						readonly params: { readonly id: string }
						readonly query: { readonly nonce: string }
					}) {
						return Effect.suspend(function () {
							attempts[request.query.nonce] = (attempts[request.query.nonce] ?? 0) + 1
							if (request.query.nonce === "1") {
								return Effect.never
							}
							return Effect.succeed({ id: request.params.id, body: request.query.nonce })
						})
					},
				},
			} as unknown as HttpApiClient.Client<NotesApiGroups>
			const live = Layer.succeed(NotesClient, client)
			const both = noteByIdNonce.informWatch(noteByIdNonce.init(), [
				{ params: { id: "a" }, query: { nonce: "1" } },
				{ params: { id: "a" }, query: { nonce: "2" } },
			])
			const store = yield* Effect.acquireRelease(
				Effect.sync(function () {
					return Store.boot({ update: noteByIdNonce.update, layer: live }, both)
				}),
				function (liveStore) {
					return Effect.sync(function () {
						liveStore.dispose()
					})
				}
			)

			yield* Effect.yieldNow
			yield* Effect.yieldNow
			store.dispatch(
				noteByIdNonce.Message.RequestedForget({
					args: { params: { id: "a" }, query: { nonce: "1" } },
				})
			)

			const model = yield* Store.takeWhen(store, function (current) {
				const dropped = noteByIdNonce.read(current, {
					params: { id: "a" },
					query: { nonce: "1" },
				})
				const kept = noteByIdNonce.read(current, {
					params: { id: "a" },
					query: { nonce: "2" },
				})
				if (AsyncData.isIdle(dropped) && AsyncData.isSuccess(kept)) return Option.some(current)
				return Option.none()
			})

			expect(noteByIdNonce.read(model, { params: { id: "a" }, query: { nonce: "1" } })).toEqual(AsyncData.Idle())
			expect(noteByIdNonce.read(model, { params: { id: "a" }, query: { nonce: "2" } })).toEqual(
				AsyncData.Success({ data: { id: "a", body: "2" } })
			)
			expect(attempts["1"]).toBe(1)
			expect(attempts["2"]).toBe(1)
		})
	)
})

describe("Query.HttpApi.Service.query empty success", () => {
	it.effect("run succeeds with no content", () =>
		Effect.gen(function* () {
			const data = yield* Effect.provide(ping.run, NotesClientLive)
			expect(data).toEqual(AsyncData.Success({ data: undefined }))
		})
	)
})

describe("Query.HttpApi.Service.query middleware", () => {
	it("includes middleware errors in the Query error type", () => {
		expectTypeOf(guarded.run).toEqualTypeOf<
			Effect.Effect<
				AsyncData.AsyncData<Note, string | NotesAuthError | Query.HttpApi.HttpApiClientError>,
				never,
				NotesClient
			>
		>()
	})
})

describe("Query.HttpApi.Service.query construction", () => {
	it("rejects stream success endpoints from query construction", () => {
		type QueryEndpointId = Parameters<typeof NotesClient.query>[2]
		expectTypeOf<"list">().toExtend<QueryEndpointId>()
		expectTypeOf<"events">().not.toExtend<QueryEndpointId>()
		expectTypeOf<"bytes">().not.toExtend<QueryEndpointId>()
		expectTypeOf<"headerEvents">().not.toExtend<QueryEndpointId>()
	})

	it("rejects an endpoint whose success codec requires encoding services", () => {
		NotesClient.query(
			"Secret",
			"notes",
			// @ts-expect-error success EncodingServices is not never
			"secret"
		)
	})

	it("rejects an endpoint whose request codec requires encoding services", () => {
		NotesClient.query(
			"Locked",
			"notes",
			// @ts-expect-error params EncodingServices is not never
			"locked"
		)
	})

	it("rejects an endpoint whose success codec requires decoding services", () => {
		NotesClient.query(
			"Decoded",
			"notes",
			// @ts-expect-error success DecodingServices is not never
			"decoded"
		)
	})
})
