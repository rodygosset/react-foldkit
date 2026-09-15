import { describe, it } from "@effect/vitest"
import { Effect, HashMap, Layer, Schema } from "effect"
import type * as HttpApiClient from "effect/unstable/httpapi/HttpApiClient"
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { expect, expectTypeOf } from "vitest"
import * as AsyncData from "../asyncData"
import * as Query from "./index"

const Note = Schema.Struct({ id: Schema.String, body: Schema.String })
type Note = typeof Note.Type

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
)

class NotesClient extends Query.HttpApi.Service<NotesClient>()("NotesClient", { api: Api }) {}

type NotesApiGroups = typeof Api extends HttpApi.HttpApi<infer _I, infer G> ? G : never

const notes = NotesClient.query("Notes", "notes", "list")

const noteById = NotesClient.query("Note", "notes", "getById")

const noteByIdKeyFields = NotesClient.query("NoteKeyFields", "notes", "getByIdNonce", {
	keyFields: ["params"],
	toKey: function (args) {
		return args.params.id
	},
})

const noteByIdNonce = NotesClient.query("NoteNonce", "notes", "getByIdNonce", {
	keyFields: ["params"],
})

const ping = NotesClient.query("Ping", "notes", "ping")

const notesClient = {
	notes: {
		list: function () {
			return Effect.succeed([{ id: "1", body: "hello" }])
		},
		getById: function (request: { readonly params: { readonly id: string } }) {
			if (request.params.id === "missing") return Effect.fail("not found")
			return Effect.succeed({ id: request.params.id, body: "hello" })
		},
		getByIdNonce: function (request: {
			readonly params: { readonly id: string }
			readonly query: { readonly nonce: string }
		}) {
			return Effect.succeed({ id: request.params.id, body: request.query.nonce })
		},
		ping: function () {
			return Effect.void
		},
	},
} as unknown as HttpApiClient.Client<NotesApiGroups>

const NotesClientLive = Layer.succeed(NotesClient, notesClient)

describe("Query.HttpApi.Service.query field", () => {
	it("is a Field Submodel", () => {
		expectTypeOf(notes.init).toBeFunction()
		expectTypeOf(notes.informLoadIfMissing).toBeFunction()
	})

	it.effect("run uses the HttpApiClient method", () =>
		Effect.gen(function* () {
			const data = yield* Effect.provide(notes.run, NotesClientLive)
			expect(data).toEqual(AsyncData.Success({ data: [{ id: "1", body: "hello" }] }))
		})
	)
})

describe("Query.HttpApi.Service.query keyed", () => {
	it("inferred args are the client request", () => {
		const args: Parameters<typeof noteById.read>[1] = { params: { id: "1" } }
		expect(args).toEqual({ params: { id: "1" } })
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

	it("distinct params keep distinct slots", () => {
		const first = noteById.informLoadIfMissing(noteById.init(), { params: { id: "a" } })
		const second = noteById.informLoadIfMissing(first.model, { params: { id: "b" } })
		expect(noteById.read(second.model, { params: { id: "a" } })).toEqual(AsyncData.Loading())
		expect(noteById.read(second.model, { params: { id: "b" } })).toEqual(AsyncData.Loading())
	})
})

describe("Query.HttpApi.Service.query keyFields", () => {
	it("keyFields plus toKey collapse slots that share the selected fields", () => {
		const first = noteByIdKeyFields.informLoadIfMissing(noteByIdKeyFields.init(), {
			params: { id: "a" },
			query: { nonce: "1" },
		})
		const second = noteByIdKeyFields.informLoadIfMissing(first.model, {
			params: { id: "a" },
			query: { nonce: "2" },
		})
		expect(
			noteByIdKeyFields.read(second.model, {
				params: { id: "a" },
				query: { nonce: "1" },
			})
		).toEqual(AsyncData.Loading())
		expect(
			noteByIdKeyFields.read(second.model, {
				params: { id: "a" },
				query: { nonce: "2" },
			})
		).toEqual(AsyncData.Loading())
		expect(HashMap.size(second.model)).toBe(1)
	})

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
	it("is a Field Submodel", () => {
		expectTypeOf(ping.init).toBeFunction()
	})

	it.effect("run succeeds with no content", () =>
		Effect.gen(function* () {
			const data = yield* Effect.provide(ping.run, NotesClientLive)
			expect(AsyncData.isSuccess(data)).toBe(true)
		})
	)
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
		function unused() {
			NotesClient.query(
				"Locked",
				"notes",
				// @ts-expect-error params EncodingServices is not never
				"locked"
			)
		}
		expect(unused).toBeTypeOf("function")
	})
})

describe("Query.HttpApi.Service tag", () => {
	it.effect("yields the provided HttpApiClient", () =>
		Effect.gen(function* () {
			const client = yield* Effect.provide(NotesClient, NotesClientLive)
			const data = yield* client.notes.list()
			expect(data).toEqual([{ id: "1", body: "hello" }])
		})
	)
})
