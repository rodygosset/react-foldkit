import { it } from "@effect/vitest"
import { Effect, Layer, Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import * as Query from "foldkit/experimental/query"
import { describe, expect, vi } from "vitest"
import { defineMessageUnion } from "./message"
import * as Store from "./store"
import * as Update from "./update"

const Api = HttpApi.make("QueryStoreApi").add(
	HttpApiGroup.make("notes").add(
		HttpApiEndpoint.get("get", "/notes/:id", {
			params: { id: Schema.String },
			success: Schema.String,
		})
	)
)
class Client extends Query.HttpApi.Service<Client>()("QueryStoreClient", { api: Api }) {}
const query = Client.query("StoreNote", "notes", "get", { interrupt: true })
const Model = Schema.Struct({ note: query.Model })
type Model = typeof Model.Type
const Message = defineMessageUnion({
	GotNoteMessage: { message: query.Message },
	ClickedLoadNote: { id: Schema.String },
	ClickedForgetNote: { id: Schema.String },
})
type Message = typeof Message.Type
const note = query.lift<Model, Message>({
	parentField: "note",
	toParentMessage: (message) => Message.GotNoteMessage({ message }),
})
const update = (model: Model, message: Message): Update.Return<Model, Message, Client> =>
	Message.match(message, {
		GotNoteMessage: ({ message }) => note.fold(model, message),
		ClickedLoadNote: ({ id }) => note.loadIfMissing(model, { params: { id } }),
		ClickedForgetNote: ({ id }) => note.forget(model, { params: { id } }),
	})

describe("Foldkit HttpApi Query in the React store", function () {
	it.live("runs endpoint Commands with the store Layer and interrupts an evicted request", () =>
		Effect.gen(function* () {
			let isStarted = false
			let isInterrupted = false
			const store = Store.boot(
				{
					update,
					layer: Layer.succeed(
						Client,
						Client.of({
							notes: {
								get: ({ params }) =>
									(params.id === "ready"
										? Effect.succeed("loaded")
										: Effect.sync(function () {
												isStarted = true
											}).pipe(
												Effect.andThen(Effect.never),
												Effect.onInterrupt(() =>
													Effect.sync(function () {
														isInterrupted = true
													})
												)
											)) as never,
							},
						})
					),
				},
				{ model: { note: query.init("store") } }
			)
			try {
				store.dispatch(Message.ClickedLoadNote({ id: "ready" }))
				yield* Effect.promise(() =>
					vi.waitFor(function () {
						expect(query.read(store.getModel().note, { params: { id: "ready" } })).toEqual({
							_tag: "Success",
							data: "loaded",
						})
					})
				)
				store.dispatch(Message.ClickedLoadNote({ id: "pending" }))
				yield* Effect.promise(() =>
					vi.waitFor(function () {
						expect(isStarted).toBe(true)
					})
				)
				store.dispatch(Message.ClickedForgetNote({ id: "pending" }))
				yield* Effect.promise(() =>
					vi.waitFor(function () {
						expect(isInterrupted).toBe(true)
					})
				)
				expect(query.read(store.getModel().note, { params: { id: "pending" } })._tag).toBe("Idle")
				expect(query.read(store.getModel().note, { params: { id: "ready" } })._tag).toBe("Success")
			} finally {
				yield* store.dispose()
			}
		})
	)
})
