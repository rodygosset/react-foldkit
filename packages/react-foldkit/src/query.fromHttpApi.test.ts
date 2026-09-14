import { describe, it } from "@effect/vitest"
import { Effect, Layer, Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { expect, expectTypeOf } from "vitest"
import * as AsyncData from "./asyncData"
import * as Query from "./query"

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
)

interface NotesClient {}

const NotesClient = Query.HttpApiService<NotesClient>()("NotesClient", { api: Api })

const fromNotesApi = Query.fromHttpApi(NotesClient)

const notes = fromNotesApi({
	name: "Notes",
	group: "notes",
	endpoint: "list",
})

const noteById = fromNotesApi({
	name: "Note",
	group: "notes",
	endpoint: "getById",
})

const noteByIdFlat = fromNotesApi({
	name: "NoteFlat",
	group: "notes",
	endpoint: "getById",
	args: { id: Schema.String },
	toRequest: function (args) {
		return { params: { id: args.id } }
	},
})

const NotesClientLive = Layer.succeed(NotesClient, {
	notes: {
		list: function () {
			return Effect.succeed([{ id: "1", body: "hello" }])
		},
		getById: function (request: { readonly params: { readonly id: string } }) {
			if (request.params.id === "missing") return Effect.fail("not found")
			return Effect.succeed({ id: request.params.id, body: "hello" })
		},
	},
} as never)

describe("Query.fromHttpApi field", () => {
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

describe("Query.fromHttpApi keyed", () => {
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

describe("Query.fromHttpApi flattened args", () => {
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
})
