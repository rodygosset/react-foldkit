import { Effect, Equal, HashMap, Option, Result, Schema } from "effect"
import { describe, expect, expectTypeOf, it, vi } from "vitest"
import * as AsyncData from "./asyncData"
import * as Command from "./command"
import { defineMessageUnion } from "./message"
import * as Query from "./query"
import * as Store from "./store"
import { evo } from "./struct"
import type * as Update from "./update"

const Note = Schema.Struct({ id: Schema.String, body: Schema.String })
type Note = typeof Note.Type

const notes = Query.define({
	name: "Notes",
	data: Schema.Array(Note),
	error: Schema.String,
	execute: Effect.succeed([{ id: "1", body: "hello" }]),
})

const noteById = Query.define({
	name: "Note",
	data: Note,
	error: Schema.String,
	args: { noteId: Schema.String },
	keyFields: ["noteId"],
	toKey: ({ noteId }) => noteId,
	execute: ({ noteId }) => Effect.succeed({ id: noteId, body: "hello" }),
})

const hello = [{ id: "1", body: "hello" }]

const commandShape = (command: { readonly name: string; readonly args?: unknown; readonly key?: string }) => ({
	name: command.name,
	args: command.args,
	key: command.key,
})

describe("Query.define field — policy routing", () => {
	it("revalidateOrLoad starts a cold field and leaves Loading and Refreshing alone", () => {
		const started = notes.informRevalidateOrLoad(notes.init())
		expect(started.model).toEqual(AsyncData.Loading())
		expect(started.commands?.map(commandShape)).toEqual([commandShape(notes.Fetch())])

		const ignoredLoading = notes.informRevalidateOrLoad(started.model)
		expect(ignoredLoading.model).toBe(started.model)
		expect(ignoredLoading.commands).toBeUndefined()

		const refreshing = AsyncData.Refreshing({ data: hello })
		const ignoredRefreshing = notes.informRevalidateOrLoad(refreshing)
		expect(ignoredRefreshing.model).toBe(refreshing)
		expect(ignoredRefreshing.commands).toBeUndefined()
	})

	it("revalidate refreshes Success and Stale and is a no-op on Idle and Failure", () => {
		const success = AsyncData.Success({ data: hello })
		const fromSuccess = notes.informRevalidate(success)
		expect(fromSuccess.model).toEqual(AsyncData.Refreshing({ data: hello }))
		expect(fromSuccess.commands?.map(commandShape)).toEqual([commandShape(notes.Fetch())])

		const stale = AsyncData.Stale({ error: "boom", data: hello })
		const fromStale = notes.informRevalidate(stale)
		expect(fromStale.model).toEqual(AsyncData.Refreshing({ data: hello }))
		expect(fromStale.commands?.map(commandShape)).toEqual([commandShape(notes.Fetch())])

		const idle = notes.init()
		expect(notes.informRevalidate(idle)).toEqual({ model: idle })
		const failure = AsyncData.Failure({ error: "boom" })
		expect(notes.informRevalidate(failure)).toEqual({ model: failure })
	})

	it("loadIfMissing loads Idle and Failure and does not refetch Success or Stale", () => {
		const loaded = AsyncData.Success({ data: hello })
		const successHit = notes.informLoadIfMissing(loaded)
		expect(successHit.model).toBe(loaded)
		expect(successHit.commands).toBeUndefined()

		const stale = AsyncData.Stale({ error: "boom", data: hello })
		const staleHit = notes.informLoadIfMissing(stale)
		expect(staleHit.model).toBe(stale)
		expect(staleHit.commands).toBeUndefined()

		const fromIdle = notes.informLoadIfMissing(notes.init())
		expect(fromIdle.model).toEqual(AsyncData.Loading())
		expect(fromIdle.commands?.map(commandShape)).toEqual([commandShape(notes.Fetch())])

		const fromFailure = notes.informLoadIfMissing(AsyncData.Failure({ error: "boom" }))
		expect(fromFailure.model).toEqual(AsyncData.Loading())
		expect(fromFailure.commands?.map(commandShape)).toEqual([commandShape(notes.Fetch())])
	})

	it("replace on a non-pending field follows revalidateOrLoad", () => {
		const replaced = notes.informReplace(notes.init())
		expect(replaced.model).toEqual(AsyncData.Loading())
		expect(replaced.commands?.map(commandShape)).toEqual([commandShape(notes.Fetch())])
	})

	it("settle keeps last-good data when a refresh fails", () => {
		const success = notes.update(AsyncData.Loading(), notes.Message.SettledFetch({ result: Result.succeed(hello) }))
		expect(success.model).toEqual(AsyncData.Success({ data: hello }))

		const refreshing = notes.informRevalidate(success.model)
		expect(refreshing.model).toEqual(AsyncData.Refreshing({ data: hello }))

		const stale = notes.update(refreshing.model, notes.Message.SettledFetch({ result: Result.fail("boom") }))
		expect(stale.model).toEqual(AsyncData.Stale({ error: "boom", data: hello }))
	})

	it("a failed initial load becomes Failure", () => {
		const failed = notes.update(AsyncData.Loading(), notes.Message.SettledFetch({ result: Result.fail("boom") }))
		expect(failed.model).toEqual(AsyncData.Failure({ error: "boom" }))
	})
})

describe("Query.define field — interrupt lifecycle", () => {
	it("informReplace while pending returns Interrupt and keeps Loading", () => {
		const pending = notes.informRevalidateOrLoad(notes.init())
		const replaced = notes.informReplace(pending.model)
		expect(replaced.model).toEqual(AsyncData.Loading())
		expect(replaced.commands?.map(commandShape)).toEqual([
			commandShape(notes.Fetch.Interrupt((outcome) => notes.Message.CompletedCancelFetch({ outcome }))),
		])
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
		expect(restarted.commands?.map(commandShape)).toEqual([commandShape(notes.Fetch())])
	})

	it("CompletedCancelFetch NotFound on Idle starts Fetch via revalidateOrLoad", () => {
		const started = notes.update(
			notes.init(),
			notes.Message.CompletedCancelFetch({
				outcome: Command.Interruptible.Outcome.NotFound(),
			})
		)
		expect(started.model).toEqual(AsyncData.Loading())
		expect(started.commands?.map(commandShape)).toEqual([commandShape(notes.Fetch())])
	})

	it("replace through Store.boot interrupts the first fetch and settles the reload", async () => {
		let attempts = 0
		const deferredNotes = Query.define({
			name: "DeferredNotes",
			data: Schema.Array(Note),
			error: Schema.String,
			execute: Effect.suspend(() => {
				attempts += 1
				if (attempts === 1) {
					return Effect.never
				}
				return Effect.succeed(hello)
			}),
		})

		const store = Store.boot(
			{ update: deferredNotes.update },
			deferredNotes.informRevalidateOrLoad(deferredNotes.init())
		)

		try {
			expect(store.getModel()).toEqual(AsyncData.Loading())

			await new Promise<void>((resolve) => {
				queueMicrotask(resolve)
			})
			await new Promise<void>((resolve) => {
				queueMicrotask(resolve)
			})

			store.dispatch(deferredNotes.Message.RequestedReplace())

			await vi.waitFor(() => {
				expect(store.getModel()).toEqual(AsyncData.Success({ data: hello }))
			})
			expect(attempts).toBe(2)
		} finally {
			store.dispose()
		}
	})
})

describe("Query.define keyed — isolation", () => {
	it("loadIfMissing writes Loading for a missing key and is a no-op on a hit", () => {
		const missing = noteById.informLoadIfMissing(noteById.init(), { noteId: "1" })
		expect(HashMap.get(missing.model, "1")).toEqual(Option.some(AsyncData.Loading()))
		expect(missing.commands?.map(commandShape)).toEqual([commandShape(noteById.Fetch({ noteId: "1" }))])

		const loaded = HashMap.set(noteById.init(), "1", AsyncData.Success({ data: { id: "1", body: "hello" } }))
		const hit = noteById.informLoadIfMissing(loaded, { noteId: "1" })
		expect(hit.model).toBe(loaded)
		expect(hit.commands).toBeUndefined()
	})

	it("informLoadIfMissing runs data-first and data-last", () => {
		const model = noteById.init()
		const args = { noteId: "1" }
		const dataFirst = noteById.informLoadIfMissing(model, args)
		const dataLast = noteById.informLoadIfMissing(args)(model)
		expect(Equal.equals(dataFirst.model, dataLast.model)).toBe(true)
		expect(dataFirst.commands?.map(commandShape)).toEqual(dataLast.commands?.map(commandShape))
	})

	it("revalidate refreshes a Success key", () => {
		const loaded = HashMap.set(noteById.init(), "1", AsyncData.Success({ data: { id: "1", body: "hello" } }))
		const refreshed = noteById.informRevalidate(loaded, { noteId: "1" })
		expect(HashMap.get(refreshed.model, "1")).toEqual(
			Option.some(AsyncData.Refreshing({ data: { id: "1", body: "hello" } }))
		)
		expect(refreshed.commands?.map(commandShape)).toEqual([commandShape(noteById.Fetch({ noteId: "1" }))])
	})

	it("settle writes only the matching key and leaves a sibling Loading", () => {
		const pendingOne = noteById.informLoadIfMissing(noteById.init(), { noteId: "1" })
		const bothPending = noteById.informLoadIfMissing(pendingOne.model, { noteId: "2" })
		expect(bothPending.commands?.map(commandShape)).toEqual([commandShape(noteById.Fetch({ noteId: "2" }))])

		const settled = noteById.update(
			bothPending.model,
			noteById.Message.SettledFetch({
				args: { noteId: "1" },
				result: Result.succeed({ id: "1", body: "hello" }),
			})
		)

		expect(HashMap.get(settled.model, "1")).toEqual(
			Option.some(AsyncData.Success({ data: { id: "1", body: "hello" } }))
		)
		expect(HashMap.get(settled.model, "2")).toEqual(Option.some(AsyncData.Loading()))
	})

	it("replace while pending returns Interrupt for that key only", () => {
		const pendingOne = noteById.informLoadIfMissing(noteById.init(), { noteId: "1" })
		const bothPending = noteById.informLoadIfMissing(pendingOne.model, { noteId: "2" })
		const replaced = noteById.informReplace(bothPending.model, { noteId: "1" })
		expect(HashMap.get(replaced.model, "1")).toEqual(Option.some(AsyncData.Loading()))
		expect(HashMap.get(replaced.model, "2")).toEqual(Option.some(AsyncData.Loading()))
		expect(replaced.commands?.map(commandShape)).toEqual([
			commandShape(
				noteById.Fetch.Interrupt({ noteId: "1" }, (outcome) =>
					noteById.Message.CompletedCancelFetch({ args: { noteId: "1" }, outcome })
				)
			),
		])
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
		expect(restarted.commands?.map(commandShape)).toEqual([commandShape(noteById.Fetch({ noteId: "1" }))])
	})

	it("CompletedCancelFetch NotFound on a missing key starts Fetch via revalidateOrLoad", () => {
		const started = noteById.update(
			noteById.init(),
			noteById.Message.CompletedCancelFetch({
				args: { noteId: "1" },
				outcome: Command.Interruptible.Outcome.NotFound(),
			})
		)
		expect(HashMap.get(started.model, "1")).toEqual(Option.some(AsyncData.Loading()))
		expect(started.commands?.map(commandShape)).toEqual([commandShape(noteById.Fetch({ noteId: "1" }))])
	})
})

describe("Query.foldChild field", () => {
	const Model = Schema.Struct({ notes: notes.Model })
	type Model = typeof Model.Type

	const Message = defineMessageUnion({
		GotNotesMessage: { message: notes.Message },
		ClickedLoad: {},
	})
	type Message = typeof Message.Type

	const notesField = notes.foldChild({
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
				expect(store.getModel().notes).toEqual(AsyncData.Success({ data: hello }))
			})
		} finally {
			store.dispose()
		}
	})

	it("fold applies SettledFetch through the parent wrapper", () => {
		const folded = notesField.fold(
			{ notes: AsyncData.Loading() },
			notes.Message.SettledFetch({ result: Result.succeed(hello) })
		)
		expect(folded.model.notes).toEqual(AsyncData.Success({ data: hello }))
	})

	it("replace returns an Interrupt Command while a fetch is pending", () => {
		const pending = notes.informRevalidateOrLoad(notes.init())
		const parent = notesField.replace({ notes: pending.model })
		expect(parent.model.notes).toEqual(AsyncData.Loading())
		expect(parent.commands?.map((command) => command.name)).toEqual(["FetchNotes.Interrupt"])
	})
})

describe("Query.foldChild keyed", () => {
	const Model = Schema.Struct({ notes: noteById.Model })
	type Model = typeof Model.Type

	const Message = defineMessageUnion({
		GotNoteMessage: { message: noteById.Message },
	})
	type Message = typeof Message.Type

	const notesField = noteById.foldChild({
		read: (model: Model) => Option.some(model.notes),
		write: (model, nextNotes) => evo(model, { notes: () => nextNotes }),
		toParentMessage: (message) => Message.GotNoteMessage({ message }),
	})

	it("loadIfMissing through foldChild writes Loading for a miss and FetchNote", () => {
		const started = notesField.loadIfMissing({ notes: noteById.init() }, { noteId: "1" })
		expect(HashMap.get(started.model.notes, "1")).toEqual(Option.some(AsyncData.Loading()))
		expect(started.commands?.map(commandShape)).toEqual([commandShape(noteById.Fetch({ noteId: "1" }))])
	})

	it("loadIfMissing runs data-first and data-last", () => {
		const model = { notes: noteById.init() }
		const args = { noteId: "1" }
		const dataFirst = notesField.loadIfMissing(model, args)
		const dataLast = notesField.loadIfMissing(args)(model)
		expect(Equal.equals(dataFirst.model.notes, dataLast.model.notes)).toBe(true)
		expect(dataFirst.commands?.map(commandShape)).toEqual(dataLast.commands?.map(commandShape))
	})
})

describe("Query.Field and Query.Keyed types", () => {
	it("define(field) is Query.Field with the config Name, Model, and Message", () => {
		expectTypeOf(notes).toEqualTypeOf<Query.Field<"Notes", typeof notes.Model, typeof notes.Message>>()
		const takesField = (_query: Query.Field.Any) => undefined
		takesField(notes)
	})

	it("define(keyed) is Query.Keyed with Name, Model, Message, Fields, and KeyField", () => {
		expectTypeOf(noteById).toEqualTypeOf<
			Query.Keyed<
				"Note",
				typeof noteById.Model,
				typeof noteById.Message,
				{ noteId: typeof Schema.String },
				"noteId"
			>
		>()
		const takesKeyed = (_query: Query.Keyed.Any) => undefined
		takesKeyed(noteById)
	})

	it("keyed Fetch is Command.Interruptible.DefinitionWithArgs", () => {
		expectTypeOf(noteById.Fetch).toEqualTypeOf<
			Command.Interruptible.DefinitionWithArgs<
				"FetchNote",
				{ noteId: typeof Schema.String },
				{ readonly noteId: string },
				Effect.Effect<(typeof noteById.Message.SettledFetch)["Type"], never, never>
			>
		>()
		expectTypeOf(noteById.Fetch.Interrupt({ noteId: "1" }, (outcome) => outcome).args).toEqualTypeOf<{
			readonly noteId: string
		}>()
	})

	it("foldChild returns Query.Fold.Field / Query.Fold.Keyed", () => {
		const ParentModel = Schema.Struct({ notes: notes.Model })
		type ParentModel = typeof ParentModel.Type
		const ParentMessage = defineMessageUnion({
			GotNotesMessage: { message: notes.Message },
		})
		type ParentMessage = typeof ParentMessage.Type

		const notesField = notes.foldChild({
			read: (model: ParentModel) => Option.some(model.notes),
			write: (model, nextNotes) => evo(model, { notes: () => nextNotes }),
			toParentMessage: (message) => ParentMessage.GotNotesMessage({ message }),
		})

		expectTypeOf(notesField).toEqualTypeOf<
			Query.Fold.Field<ParentModel, ParentMessage, typeof notes.Message.Type>
		>()

		const KeyedParent = Schema.Struct({ notes: noteById.Model })
		type KeyedParent = typeof KeyedParent.Type
		const KeyedParentMessage = defineMessageUnion({
			GotNoteMessage: { message: noteById.Message },
		})
		type KeyedParentMessage = typeof KeyedParentMessage.Type

		const keyedField = noteById.foldChild({
			read: (model: KeyedParent) => Option.some(model.notes),
			write: (model, nextNotes) => evo(model, { notes: () => nextNotes }),
			toParentMessage: (message) => KeyedParentMessage.GotNoteMessage({ message }),
		})

		expectTypeOf(keyedField).toEqualTypeOf<
			Query.Fold.Keyed<KeyedParent, KeyedParentMessage, typeof noteById.Message.Type, { readonly noteId: string }>
		>()
	})

	it("keyed informLoadIfMissing is Update.Fold over { noteId: string }", () => {
		expectTypeOf(noteById.informLoadIfMissing).toEqualTypeOf<
			Update.Fold<(typeof noteById.Model)["Type"], (typeof noteById.Message)["Type"], { readonly noteId: string }>
		>()
	})
})
