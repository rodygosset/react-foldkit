import { Effect, HashMap, Option, Result, Schema } from "effect"
import { describe, expect, it, vi } from "vitest"
import * as AsyncData from "./asyncData"
import * as Command from "./command"
import { defineMessageUnion } from "./message"
import * as Query from "./query"
import * as Store from "./store"
import { evo } from "./struct"
import type * as Update from "./update"

const Note = Schema.Struct({ id: Schema.String, body: Schema.String })
type Note = typeof Note.Type

describe("Query.define field", () => {
	const notes = Query.define({
		name: "Notes",
		data: Schema.Array(Note),
		error: Schema.String,
		execute: Effect.succeed([{ id: "1", body: "hello" }]),
	})

	it("revalidateOrLoad starts a cold field and leaves an in-flight field alone", () => {
		const started = notes.informRevalidateOrLoad(notes.init())
		expect(started.model).toEqual(AsyncData.Loading())
		expect(started.commands?.map((command) => command.name)).toEqual(["FetchNotes"])

		const ignored = notes.informRevalidateOrLoad(started.model)
		expect(ignored.model).toBe(started.model)
		expect(ignored.commands).toBeUndefined()
	})

	it("settle keeps last-good data when a refresh fails", () => {
		const success = notes.update(
			AsyncData.Loading(),
			notes.Message.SettledFetch({ result: Result.succeed([{ id: "1", body: "hello" }]) })
		)
		expect(success.model).toEqual(AsyncData.Success({ data: [{ id: "1", body: "hello" }] }))

		const refreshing = notes.informRevalidate(success.model)
		expect(refreshing.model).toEqual(AsyncData.Refreshing({ data: [{ id: "1", body: "hello" }] }))

		const stale = notes.update(refreshing.model, notes.Message.SettledFetch({ result: Result.fail("boom") }))
		expect(stale.model).toEqual(AsyncData.Stale({ error: "boom", data: [{ id: "1", body: "hello" }] }))
	})

	it("CompletedCancelFetch Interrupted restarts Fetch on a pending field", () => {
		const pending = notes.informRevalidateOrLoad(notes.init())
		const restarted = notes.update(
			pending.model,
			notes.Message.CompletedCancelFetch({
				outcome: Command.Interruptible.Outcome.Interrupted(),
			})
		)
		expect(restarted.model).toEqual(AsyncData.Loading())
		expect(restarted.commands?.map((command) => command.name)).toEqual(["FetchNotes"])
	})

	it("loadIfMissing does not refetch Success", () => {
		const loaded = AsyncData.Success({ data: [{ id: "1", body: "hello" }] })
		const result = notes.informLoadIfMissing(loaded)
		expect(result.model).toBe(loaded)
		expect(result.commands).toBeUndefined()
	})

	it("informReplace while pending returns Interrupt and keeps Loading", () => {
		const pending = notes.informRevalidateOrLoad(notes.init())
		const replaced = notes.informReplace(pending.model)
		expect(replaced.model).toEqual(AsyncData.Loading())
		expect(replaced.commands?.map((command) => command.name)).toEqual(["FetchNotes.Interrupt"])
	})
})

describe("Query.define keyed cache", () => {
	const noteById = Query.define({
		name: "Note",
		data: Note,
		error: Schema.String,
		args: { noteId: Schema.String },
		keyFields: ["noteId"],
		toKey: ({ noteId }) => noteId,
		execute: ({ noteId }) => Effect.succeed({ id: noteId, body: "hello" }),
	})

	it("loadIfMissing writes Loading for a missing key and is a no-op on a hit", () => {
		const missing = noteById.informLoadIfMissing(noteById.init(), { noteId: "1" })
		expect(HashMap.get(missing.model, "1")).toEqual(Option.some(AsyncData.Loading()))
		expect(missing.commands?.map((command) => command.name)).toEqual(["FetchNote"])

		const loaded = HashMap.set(noteById.init(), "1", AsyncData.Success({ data: { id: "1", body: "hello" } }))
		const hit = noteById.informLoadIfMissing(loaded, { noteId: "1" })
		expect(hit.model).toBe(loaded)
		expect(hit.commands).toBeUndefined()
	})

	it("settle writes only the matching key", () => {
		const pending = noteById.informLoadIfMissing(noteById.init(), { noteId: "1" })
		const settled = noteById.update(
			pending.model,
			noteById.Message.SettledFetch({
				args: { noteId: "1" },
				result: Result.succeed({ id: "1", body: "hello" }),
			})
		)

		expect(HashMap.get(settled.model, "1")).toEqual(
			Option.some(AsyncData.Success({ data: { id: "1", body: "hello" } }))
		)
		expect(HashMap.has(settled.model, "2")).toBe(false)
	})

	it("replace while pending returns Interrupt and keeps the in-flight entry", () => {
		const pending = noteById.informLoadIfMissing(noteById.init(), { noteId: "1" })
		const replaced = noteById.informReplace(pending.model, { noteId: "1" })
		expect(HashMap.get(replaced.model, "1")).toEqual(Option.some(AsyncData.Loading()))
		expect(replaced.commands?.map((command) => command.name)).toEqual(["FetchNote.Interrupt"])
	})

	it("CompletedCancelFetch Interrupted restarts Fetch on a pending key", () => {
		const pending = noteById.informLoadIfMissing(noteById.init(), { noteId: "1" })
		const restarted = noteById.update(
			pending.model,
			noteById.Message.CompletedCancelFetch({
				args: { noteId: "1" },
				outcome: Command.Interruptible.Outcome.Interrupted(),
			})
		)
		expect(HashMap.get(restarted.model, "1")).toEqual(Option.some(AsyncData.Loading()))
		expect(restarted.commands?.map((command) => command.name)).toEqual(["FetchNote"])
	})
})

describe("Query.bind", () => {
	const notes = Query.define({
		name: "Notes",
		data: Schema.Array(Note),
		error: Schema.String,
		execute: Effect.succeed([{ id: "1", body: "hello" }]),
	})

	const Model = Schema.Struct({ notes: notes.Model })
	type Model = typeof Model.Type

	const Message = defineMessageUnion({
		GotNotesMessage: { message: notes.Message },
		ClickedLoad: {},
	})
	type Message = typeof Message.Type

	const notesField = notes.bind({
		read: (model: Model) => Option.some(model.notes),
		write: (model, nextNotes) => evo(model, { notes: () => nextNotes }),
		toParentMessage: (message) => Message.GotNotesMessage({ message }),
	})

	const update = (model: Model, message: Message) =>
		Message.match<Update.Return<Model, Message>>(message, {
			GotNotesMessage: ({ message }) => notesField.fold(model, message),
			ClickedLoad: () => notesField.revalidateOrLoad(model),
		})

	it("settles an init load through the parent Got* wrapper", async () => {
		const init = notesField.revalidateOrLoad({ notes: notes.init() })
		const store = Store.boot({ update }, init)

		try {
			expect(store.getModel().notes).toEqual(AsyncData.Loading())

			await vi.waitFor(() => {
				expect(store.getModel().notes).toEqual(AsyncData.Success({ data: [{ id: "1", body: "hello" }] }))
			})
		} finally {
			store.dispose()
		}
	})

	it("replace returns an Interrupt Command while a fetch is pending", () => {
		const pending = notes.informRevalidateOrLoad(notes.init())
		const parent = notesField.replace({ notes: pending.model })
		expect(parent.model.notes).toEqual(AsyncData.Loading())
		expect(parent.commands?.map((command) => command.name)).toEqual(["FetchNotes.Interrupt"])
	})
})

describe("Query.bind keyed", () => {
	const noteById = Query.define({
		name: "Note",
		data: Note,
		error: Schema.String,
		args: { noteId: Schema.String },
		keyFields: ["noteId"],
		toKey: ({ noteId }) => noteId,
		execute: ({ noteId }) => Effect.succeed({ id: noteId, body: "hello" }),
	})

	const Model = Schema.Struct({ notes: noteById.Model })
	type Model = typeof Model.Type

	const Message = defineMessageUnion({
		GotNoteMessage: { message: noteById.Message },
	})
	type Message = typeof Message.Type

	const notesField = noteById.bind({
		read: (model: Model) => Option.some(model.notes),
		write: (model, nextNotes) => evo(model, { notes: () => nextNotes }),
		toParentMessage: (message) => Message.GotNoteMessage({ message }),
	})

	it("loadIfMissing through bind writes Loading for a miss and FetchNote", () => {
		const started = notesField.loadIfMissing({ notes: noteById.init() }, { noteId: "1" })
		expect(HashMap.get(started.model.notes, "1")).toEqual(Option.some(AsyncData.Loading()))
		expect(started.commands?.map((command) => command.name)).toEqual(["FetchNote"])
	})
})
