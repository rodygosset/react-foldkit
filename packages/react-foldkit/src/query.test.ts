import { it } from "@effect/vitest"
import { Context, Deferred, Effect, Layer, Option, Schema } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"
import { HttpApi, HttpApiClient, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import * as AsyncData from "foldkit/asyncData"
import * as Query from "foldkit/experimental/query"
import { defineMessageUnion } from "foldkit/message"
import type * as Update from "foldkit/update"
import { describe, expect, vi } from "vitest"
import * as Store from "./store"

const Api = HttpApi.make("QueryStoreApi").add(
	HttpApiGroup.make("notes").add(
		HttpApiEndpoint.get("get", "/notes/:id", {
			params: { id: Schema.String },
			success: Schema.String,
			error: Schema.String,
		})
	)
)
class Client extends Context.Service<Client, HttpApiClient.ForApi<typeof Api>>()("QueryStoreClient") {}
const query = Query.define({
	name: "StoreNote",
	args: { id: Schema.String },
	data: Schema.String,
	error: Schema.String,
	execute: ({ id }) =>
		Effect.gen(function* () {
			const client = yield* Client
			return yield* client.notes.get({ params: { id } })
		}).pipe(Effect.mapError(String)),
})
const Model = Schema.Struct({ note: query.Model })
type Model = typeof Model.Type
const Message = defineMessageUnion({
	GotNoteMessage: { message: query.Message },
	ClickedLoadNote: { id: Schema.String },
	ClickedResetNotes: {},
})
type Message = typeof Message.Type
const note = query.lift<Model, Message>({
	parentField: "note",
	toParentMessage: (message) => Message.GotNoteMessage({ message }),
})
const update = (model: Model, message: Message): Update.Return<Model, Message, Client> =>
	Message.match(message, {
		GotNoteMessage: ({ message }) => note.fold(model, message),
		ClickedLoadNote: ({ id }) => note.loadIfMissing(model, { id }),
		ClickedResetNotes: () => note.reset(model),
	})

describe("HttpApi client service Queries in the React store", function () {
	it.effect("runs endpoint Commands with the Store Layer and retains endpoint failures", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.makeWith(Api, {
				baseUrl: "http://notes.local",
				httpClient: HttpClient.make((request, url) =>
					Effect.succeed(
						HttpClientResponse.fromWeb(
							request,
							Response.json(url.pathname.endsWith("/missing") ? "missing" : "loaded", {
								status: url.pathname.endsWith("/missing") ? 500 : 200,
							})
						)
					)
				),
			})
			const store = yield* Store.make(
				{ update, resources: Layer.succeed(Client, client) },
				{ model: { note: query.init() } }
			)
			store.dispatch(Message.ClickedLoadNote({ id: "ready" }))
			const loaded = yield* Store.takeWhen(store, (model) =>
				AsyncData.getData(query.read(model.note, { id: "ready" }))
			)
			expect(loaded).toBe("loaded")
			store.dispatch(Message.ClickedLoadNote({ id: "missing" }))
			const error = yield* Store.takeWhen(store, function (model) {
				const data = query.read(model.note, { id: "missing" })
				return data._tag === "Failure" ? Option.some(data.error) : Option.none()
			})
			expect(error).toBe("missing")
		})
	)

	it.live("ignores an endpoint response delivered after its Query cache was reset", () =>
		Effect.gen(function* () {
			const pending = yield* Deferred.make<string>()
			const started = yield* Deferred.make<void>()
			const client = yield* HttpApiClient.makeWith(Api, {
				baseUrl: "http://notes.local",
				httpClient: HttpClient.make((request) =>
					Deferred.succeed(started, undefined).pipe(
						Effect.andThen(Deferred.await(pending)),
						Effect.map((value) => HttpClientResponse.fromWeb(request, Response.json(value)))
					)
				),
			})
			const store = yield* Store.make(
				{ update, resources: Layer.succeed(Client, client) },
				{ model: { note: query.init() } }
			)
			store.dispatch(Message.ClickedLoadNote({ id: "pending" }))
			yield* Deferred.await(started)
			store.commit(Message.ClickedResetNotes())
			expect(query.read(store.getModel().note, { id: "pending" })._tag).toBe("Idle")
			yield* Deferred.succeed(pending, "late")
			yield* Effect.promise(() => vi.waitFor(() => expect(store.getRunningCommands()).toHaveLength(0)))
			expect(query.read(store.getModel().note, { id: "pending" })._tag).toBe("Idle")
		})
	)
})
