import { describe, it } from "@effect/vitest"
import { Cause, Context, Effect, Exit, HashMap, Layer, Schema } from "effect"
import type * as HttpApiClient from "effect/unstable/httpapi/HttpApiClient"
import { HttpClientError, HttpClientRequest } from "effect/unstable/http"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiMiddleware } from "effect/unstable/httpapi"
import { expect, expectTypeOf } from "vitest"
import * as AsyncData from "../asyncData"
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
)

class NotesClient extends Query.HttpApi.Service<NotesClient>()("NotesClient", { api: Api }) {}

type NotesApiGroups = typeof Api extends HttpApi.HttpApi<infer _I, infer G> ? G : never

const notes = NotesClient.query("Notes", "notes", "list")
const noteById = NotesClient.query("Note", "notes", "getById")
const noteByIdNonce = NotesClient.query("NoteNonce", "notes", "getByIdNonce", {
	keyFields: ["params"],
})
const createNote = NotesClient.query("CreateNote", "notes", "create")
const guarded = NotesClient.query("Guarded", "notes", "guarded")
const ping = NotesClient.query("Ping", "notes", "ping")

function transportError(): HttpClientError.HttpClientError {
	return new HttpClientError.HttpClientError({
		reason: new HttpClientError.TransportError({
			request: HttpClientRequest.get("/notes"),
			description: "offline",
		}),
	})
}

function schemaError(): Schema.SchemaError {
	try {
		Schema.decodeUnknownSync(Schema.Number)("nope")
	} catch (error) {
		if (Schema.isSchemaError(error)) return error
	}
	throw new Error("expected Schema.decodeUnknownSync to throw SchemaError")
}

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

describe("Query.HttpApi.Service.query field", () => {
	it("is a Field whose run depends on the client tag", () => {
		expectTypeOf(notes.run).toEqualTypeOf<
			Effect.Effect<AsyncData.AsyncData<ReadonlyArray<Note>, string>, never, NotesClient>
		>()
	})

	it.effect("run uses the HttpApiClient method", () =>
		Effect.gen(function* () {
			const data = yield* Effect.provide(notes.run, NotesClientLive)
			expect(data).toEqual(AsyncData.Success({ data: [{ id: "1", body: "hello" }] }))
		})
	)
})

describe("Query.HttpApi.Service.query keyed", () => {
	it("is a Keyed Submodel over the client request", () => {
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

	it.effect("run dies on HttpClientError", () =>
		Effect.gen(function* () {
			const exit = yield* Effect.exit(
				Effect.provide(noteById.run({ params: { id: "transport" } }), NotesClientLive)
			)
			expect(Exit.isFailure(exit)).toBe(true)
			if (Exit.isFailure(exit)) {
				expect(Cause.hasDies(exit.cause)).toBe(true)
				expect(HttpClientError.isHttpClientError(Cause.squash(exit.cause))).toBe(true)
			}
		})
	)

	it.effect("run dies on SchemaError", () =>
		Effect.gen(function* () {
			const exit = yield* Effect.exit(Effect.provide(noteById.run({ params: { id: "schema" } }), NotesClientLive))
			expect(Exit.isFailure(exit)).toBe(true)
			if (Exit.isFailure(exit)) {
				expect(Cause.hasDies(exit.cause)).toBe(true)
				expect(Schema.isSchemaError(Cause.squash(exit.cause))).toBe(true)
			}
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

describe("Query.HttpApi.Service.query keyFields", () => {
	it("keyFields without toKey keep nested params in the slot key", () => {
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
		expect(noteByIdNonce.Fetch({ params: { id: "a" }, query: { nonce: "1" } }).key).toEqual(
			noteByIdNonce.Fetch({ params: { id: "a" }, query: { nonce: "2" } }).key
		)
	})
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
	it("includes middleware errors in the Field error type", () => {
		expectTypeOf(guarded.run).toEqualTypeOf<
			Effect.Effect<AsyncData.AsyncData<Note, string | NotesAuthError>, never, NotesClient>
		>()
	})
})

describe("Query.HttpApi.Service.query construction", () => {
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
