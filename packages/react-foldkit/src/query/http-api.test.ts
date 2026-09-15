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
		.add(HttpApiEndpoint.get("ping", "/ping"))
)

class NotesClient extends Query.HttpApi.Service<NotesClient>()("NotesClient", { api: Api }) {}

type NotesApiGroups = typeof Api extends HttpApi.HttpApi<infer _I, infer G> ? G : never

const notes = NotesClient.query({
	name: "Notes",
	group: "notes",
	endpoint: "list",
})

const noteById = NotesClient.query({
	name: "Note",
	group: "notes",
	endpoint: "getById",
})

const noteByIdFlat = NotesClient.query({
	name: "NoteFlat",
	group: "notes",
	endpoint: "getById",
	args: { id: Schema.String },
	toRequest: function (args) {
		return { params: { id: args.id } }
	},
})

const noteByIdKeyFields = NotesClient.query({
	name: "NoteKeyFields",
	group: "notes",
	endpoint: "getById",
	args: { id: Schema.String, nonce: Schema.String },
	keyFields: ["id"],
	toRequest: function (args) {
		return { params: { id: args.id } }
	},
})

const ping = NotesClient.query({
	name: "Ping",
	group: "notes",
	endpoint: "ping",
})

const notesClient = {
	notes: {
		list: function () {
			return Effect.succeed([{ id: "1", body: "hello" }])
		},
		getById: function (request: { readonly params: { readonly id: string } }) {
			if (request.params.id === "missing") return Effect.fail("not found")
			return Effect.succeed({ id: request.params.id, body: "hello" })
		},
		ping: function () {
			return Effect.void
		},
	},
} as unknown as HttpApiClient.Client<NotesApiGroups, never, never>

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

describe("Query.HttpApi.Service.query flattened args", () => {
	it("keys by the flattened args schema", () => {
		const args: Parameters<typeof noteByIdFlat.read>[1] = { id: "1" }
		expect(args).toEqual({ id: "1" })
	})

	it.effect("toRequest builds the client request", () =>
		Effect.gen(function* () {
			const data = yield* Effect.provide(noteByIdFlat.run({ id: "3" }), NotesClientLive)
			expect(data).toEqual(AsyncData.Success({ data: { id: "3", body: "hello" } }))
		})
	)

	it("flattened run args are the flattened schema", () => {
		expectTypeOf(noteByIdFlat.run).parameter(0).toEqualTypeOf<{ readonly id: string }>()
	})

	it("keyFields collapse slots that share the selected fields", () => {
		const first = noteByIdKeyFields.informLoadIfMissing(noteByIdKeyFields.init(), { id: "a", nonce: "1" })
		const second = noteByIdKeyFields.informLoadIfMissing(first.model, { id: "a", nonce: "2" })
		expect(noteByIdKeyFields.read(second.model, { id: "a", nonce: "1" })).toEqual(AsyncData.Loading())
		expect(noteByIdKeyFields.read(second.model, { id: "a", nonce: "2" })).toEqual(AsyncData.Loading())
		expect(HashMap.size(second.model)).toBe(1)
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
	it("throws for an unknown group", () => {
		expect(function () {
			NotesClient.query({
				name: "Missing",
				group: "missing",
				endpoint: "list",
			} as never)
		}).toThrow(/unknown group/)
	})

	it("throws for an unknown endpoint", () => {
		expect(function () {
			NotesClient.query({
				name: "Missing",
				group: "notes",
				endpoint: "missing",
			} as never)
		}).toThrow(/unknown endpoint/)
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
