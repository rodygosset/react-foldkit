import { describe, it } from "@effect/vitest"
import { Array, Effect, Equal, HashMap, Option, Result, Schema } from "effect"
import { expect, expectTypeOf } from "vitest"
import * as AsyncData from "./asyncData"
import * as Command from "./command"
import { defineMessageUnion } from "./message"
import * as Query from "./query"
import * as Store from "./store"
import { evo } from "./struct"
import * as Subscription from "./subscription"
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
	execute: ({ noteId }) => Effect.succeed({ id: noteId, body: "hello" }),
})

const noteByIdAndLocale = Query.define({
	name: "NoteLocale",
	data: Note,
	error: Schema.String,
	args: { noteId: Schema.String, locale: Schema.String },
	execute: ({ noteId, locale }) => Effect.succeed({ id: `${noteId}:${locale}`, body: "hello" }),
})

const noteByIdPreview = Query.define({
	name: "NotePreview",
	data: Note,
	error: Schema.String,
	args: { noteId: Schema.String, preview: Schema.Boolean },
	keyFields: ["noteId"],
	toKey: ({ noteId }) => noteId,
	execute: ({ noteId }) => Effect.succeed({ id: noteId, body: "hello" }),
})

const hello = [{ id: "1", body: "hello" }]

const noteSlot = (noteId: string, data: AsyncData.AsyncData<Note, string>) => ({
	args: { noteId },
	data,
})

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

	it("CompletedCancelFetch NotFound on Idle is a no-op", () => {
		const started = notes.update(
			notes.init(),
			notes.Message.CompletedCancelFetch({
				outcome: Command.Interruptible.Outcome.NotFound(),
			})
		)
		expect(started.model).toEqual(AsyncData.Idle())
		expect(started.commands).toBeUndefined()
	})

	it.effect("replace through Store.boot interrupts the first fetch and settles the reload", () =>
		Effect.gen(function* () {
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

			const store = yield* Effect.acquireRelease(
				Effect.sync(() =>
					Store.boot({ update: deferredNotes.update }, deferredNotes.informRevalidateOrLoad(deferredNotes.init()))
				),
				(live) => Effect.sync(() => live.dispose())
			)

			expect(store.getModel()).toEqual(AsyncData.Loading())
			yield* Effect.yieldNow
			yield* Effect.yieldNow
			store.dispatch(deferredNotes.Message.RequestedReplace())
			const model = yield* Store.takeWhen(store, (current) =>
				AsyncData.isSuccess(current) ? Option.some(current) : Option.none()
			)
			expect(model).toEqual(AsyncData.Success({ data: hello }))
			expect(attempts).toBe(2)
		})
	)
})

describe("Query.define keyed — isolation", () => {
	it("loadIfMissing writes Loading for a missing key and is a no-op on a hit", () => {
		const missing = noteById.informLoadIfMissing(noteById.init(), { noteId: "1" })
		expect(noteById.read(missing.model, { noteId: "1" })).toEqual(AsyncData.Loading())
		expect(missing.commands?.map(commandShape)).toEqual([commandShape(noteById.Fetch({ noteId: "1" }))])

		const loaded = HashMap.set(
			noteById.init(),
			"1",
			noteSlot("1", AsyncData.Success({ data: { id: "1", body: "hello" } }))
		)
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
		const loaded = HashMap.set(
			noteById.init(),
			"1",
			noteSlot("1", AsyncData.Success({ data: { id: "1", body: "hello" } }))
		)
		const refreshed = noteById.informRevalidate(loaded, { noteId: "1" })
		expect(noteById.read(refreshed.model, { noteId: "1" })).toEqual(
			AsyncData.Refreshing({ data: { id: "1", body: "hello" } })
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

		expect(noteById.read(settled.model, { noteId: "1" })).toEqual(
			AsyncData.Success({ data: { id: "1", body: "hello" } })
		)
		expect(noteById.read(settled.model, { noteId: "2" })).toEqual(AsyncData.Loading())
	})

	it("replace while pending returns Interrupt for that key only", () => {
		const pendingOne = noteById.informLoadIfMissing(noteById.init(), { noteId: "1" })
		const bothPending = noteById.informLoadIfMissing(pendingOne.model, { noteId: "2" })
		const replaced = noteById.informReplace(bothPending.model, { noteId: "1" })
		expect(noteById.read(replaced.model, { noteId: "1" })).toEqual(AsyncData.Loading())
		expect(noteById.read(replaced.model, { noteId: "2" })).toEqual(AsyncData.Loading())
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
		expect(noteById.read(restarted.model, { noteId: "1" })).toEqual(AsyncData.Loading())
		expect(restarted.commands?.map(commandShape)).toEqual([commandShape(noteById.Fetch({ noteId: "1" }))])
	})

	it("CompletedCancelFetch NotFound on a missing key is a no-op", () => {
		const started = noteById.update(
			noteById.init(),
			noteById.Message.CompletedCancelFetch({
				args: { noteId: "1" },
				outcome: Command.Interruptible.Outcome.NotFound(),
			})
		)
		expect(HashMap.isEmpty(started.model)).toBe(true)
		expect(started.commands).toBeUndefined()
	})
})

describe("Query.lift field", () => {
	const Model = Schema.Struct({ notes: notes.Model })
	type Model = typeof Model.Type

	const Message = defineMessageUnion({
		GotNotesMessage: notes.ParentMessage,
		ClickedLoad: {},
	})
	type Message = typeof Message.Type

	const foldNotes = notes.lift<Model>()({
		field: "notes",
		toParentMessage: Message.GotNotesMessage,
	})

	const update = (model: Model, message: Message) =>
		Message.match<Update.Return<Model, Message>>(message, {
			GotNotesMessage: foldNotes(model),
			ClickedLoad: function () {
				return foldNotes.revalidateOrLoad(model)
			},
		})

	it.effect("settles an init load through the parent Got* wrapper", () =>
		Effect.gen(function* () {
			const init = foldNotes.revalidateOrLoad({ notes: notes.init() })
			const store = yield* Effect.acquireRelease(
				Effect.sync(() => Store.boot({ update }, init)),
				(live) => Effect.sync(() => live.dispose())
			)

			expect(store.getModel().notes).toEqual(AsyncData.Loading())
			const model = yield* Store.takeWhen(store, (current) =>
				AsyncData.isSuccess(current.notes) ? Option.some(current) : Option.none()
			)
			expect(model.notes).toEqual(AsyncData.Success({ data: hello }))
		})
	)

	it("fold applies SettledFetch through the parent wrapper", () => {
		const folded = foldNotes(
			{ notes: AsyncData.Loading() },
			{ message: notes.Message.SettledFetch({ result: Result.succeed(hello) }) }
		)
		expect(folded.model.notes).toEqual(AsyncData.Success({ data: hello }))
	})

	it("replace returns an Interrupt Command while a fetch is pending", () => {
		const pending = notes.informRevalidateOrLoad(notes.init())
		const parent = foldNotes.replace({ notes: pending.model })
		expect(parent.model.notes).toEqual(AsyncData.Loading())
		expect(parent.commands?.map((command) => command.name)).toEqual(["FetchNotes.Interrupt"])
	})
})

describe("Query.lift keyed", () => {
	const Model = Schema.Struct({ notes: noteById.Model })
	type Model = typeof Model.Type

	const Message = defineMessageUnion({
		GotNoteMessage: noteById.ParentMessage,
	})
	type Message = typeof Message.Type

	const foldNotes = noteById.lift<Model>()({
		field: "notes",
		toParentMessage: Message.GotNoteMessage,
	})

	it("loadIfMissing through lift writes Loading for a miss and FetchNote", () => {
		const started = foldNotes.loadIfMissing({ notes: noteById.init() }, { noteId: "1" })
		expect(noteById.read(started.model.notes, { noteId: "1" })).toEqual(AsyncData.Loading())
		expect(started.commands?.map(commandShape)).toEqual([commandShape(noteById.Fetch({ noteId: "1" }))])
	})

	it("loadIfMissing runs data-first and data-last", () => {
		const model = { notes: noteById.init() }
		const args = { noteId: "1" }
		const dataFirst = foldNotes.loadIfMissing(model, args)
		const dataLast = foldNotes.loadIfMissing(args)(model)
		expect(Equal.equals(dataFirst.model.notes, dataLast.model.notes)).toBe(true)
		expect(dataFirst.commands?.map(commandShape)).toEqual(dataLast.commands?.map(commandShape))
	})
})

describe("Query.lift field lens", () => {
	const Model = Schema.Struct({ notes: notes.Model })
	type Model = typeof Model.Type
	const Message = defineMessageUnion({
		GotNotesMessage: notes.ParentMessage,
	})
	type Message = typeof Message.Type

	it("field config writes the same Loading and Fetch as a ChildFold lens", () => {
		const foldFromField = notes.lift<Model>()({
			field: "notes",
			toParentMessage: Message.GotNotesMessage,
		})
		const foldFromLens = notes.lift({
			read: function (model: Model) {
				return Option.some(model.notes)
			},
			write: function (model, nextNotes) {
				return evo(model, { notes: () => nextNotes })
			},
			toParentMessage: function (message) {
				return Message.GotNotesMessage({ message })
			},
		})
		const parent = { notes: notes.init() }
		const fromField = foldFromField.revalidateOrLoad(parent)
		const fromLens = foldFromLens.revalidateOrLoad(parent)
		expect(fromField.model).toEqual(fromLens.model)
		expect(fromField.commands?.map(commandShape)).toEqual(fromLens.commands?.map(commandShape))
	})

	it("the fold binds Model first and takes ParentMessageValue", () => {
		const foldFromField = notes.lift<Model>()({
			field: "notes",
			toParentMessage: Message.GotNotesMessage,
		})
		const parent = { notes: AsyncData.Loading() }
		const fields = {
			message: notes.Message.SettledFetch({ result: Result.succeed(hello) }),
		}
		const dataFirst = foldFromField(parent, fields)
		const viaCurry = foldFromField(parent)(fields)
		expect(dataFirst.model.notes).toEqual(AsyncData.Success({ data: hello }))
		expect(Equal.equals(dataFirst.model.notes, viaCurry.model.notes)).toBe(true)
	})
})

describe("Query.define keyed — default toKey", () => {
	it("joins every args field when keyFields and toKey are omitted", () => {
		const started = noteByIdAndLocale.informLoadIfMissing(noteByIdAndLocale.init(), {
			noteId: "1",
			locale: "en",
		})
		expect(noteByIdAndLocale.read(started.model, { noteId: "1", locale: "en" })).toEqual(AsyncData.Loading())
		expect(HashMap.has(started.model, "1:en")).toBe(true)
		expect(HashMap.has(started.model, "1")).toBe(false)
	})

	it("keeps Interrupt identity on keyFields when extra args are present", () => {
		const pending = noteByIdPreview.informLoadIfMissing(noteByIdPreview.init(), {
			noteId: "1",
			preview: true,
		})
		const sameKey = noteByIdPreview.informLoadIfMissing(pending.model, { noteId: "1", preview: false })
		expect(sameKey.commands).toBeUndefined()
		expect(HashMap.has(pending.model, "1")).toBe(true)
	})
})

describe("Query.define keyed — watch and forget", () => {
	it("informWatch from [1, 2] then [1] drops key 2 and Interrupts the pending fetch", () => {
		const both = noteById.informWatch(noteById.init(), [{ noteId: "1" }, { noteId: "2" }])
		expect(noteById.read(both.model, { noteId: "1" })).toEqual(AsyncData.Loading())
		expect(noteById.read(both.model, { noteId: "2" })).toEqual(AsyncData.Loading())
		expect(both.commands?.map(commandShape)).toEqual([
			commandShape(noteById.Fetch({ noteId: "1" })),
			commandShape(noteById.Fetch({ noteId: "2" })),
		])

		const onlyOne = noteById.informWatch(both.model, [{ noteId: "1" }])
		expect(noteById.read(onlyOne.model, { noteId: "1" })).toEqual(AsyncData.Loading())
		expect(HashMap.get(onlyOne.model, "2")).toEqual(Option.none())
		expect(onlyOne.commands?.map(commandShape)).toEqual([
			commandShape(
				noteById.Fetch.Interrupt({ noteId: "2" }, (outcome) =>
					noteById.Message.CompletedCancelFetch({ args: { noteId: "2" }, outcome })
				)
			),
		])
	})

	it("informWatch runs data-first and data-last", () => {
		const model = noteById.init()
		const args = [{ noteId: "1" }] as const
		const dataFirst = noteById.informWatch(model, args)
		const dataLast = noteById.informWatch(args)(model)
		expect(Equal.equals(dataFirst.model, dataLast.model)).toBe(true)
		expect(dataFirst.commands?.map(commandShape)).toEqual(dataLast.commands?.map(commandShape))
	})

	it("informForget while pending removes the key and returns Interrupt", () => {
		const pending = noteById.informLoadIfMissing(noteById.init(), { noteId: "2" })
		const forgotten = noteById.informForget(pending.model, { noteId: "2" })
		expect(HashMap.get(forgotten.model, "2")).toEqual(Option.none())
		expect(forgotten.commands?.map(commandShape)).toEqual([
			commandShape(
				noteById.Fetch.Interrupt({ noteId: "2" }, (outcome) =>
					noteById.Message.CompletedCancelFetch({ args: { noteId: "2" }, outcome })
				)
			),
		])
	})

	it("SettledFetch after forget does not reinsert the key", () => {
		const pending = noteById.informLoadIfMissing(noteById.init(), { noteId: "1" })
		const forgotten = noteById.informForget(pending.model, { noteId: "1" })
		const late = noteById.update(
			forgotten.model,
			noteById.Message.SettledFetch({
				args: { noteId: "1" },
				result: Result.succeed({ id: "1", body: "hello" }),
			})
		)
		expect(HashMap.get(late.model, "1")).toEqual(Option.none())
		expect(HashMap.isEmpty(late.model)).toBe(true)
	})

	it("SettledFetch after watch-drop does not reinsert; after re-watch it writes", () => {
		const both = noteById.informWatch(noteById.init(), [{ noteId: "1" }, { noteId: "2" }])
		const dropped = noteById.informWatch(both.model, [{ noteId: "1" }])
		const late = noteById.update(
			dropped.model,
			noteById.Message.SettledFetch({
				args: { noteId: "2" },
				result: Result.succeed({ id: "2", body: "hello" }),
			})
		)
		expect(HashMap.get(late.model, "2")).toEqual(Option.none())

		const rewatched = noteById.informWatch(late.model, [{ noteId: "1" }, { noteId: "2" }])
		expect(noteById.read(rewatched.model, { noteId: "2" })).toEqual(AsyncData.Loading())
		const settled = noteById.update(
			rewatched.model,
			noteById.Message.SettledFetch({
				args: { noteId: "2" },
				result: Result.succeed({ id: "2", body: "hello" }),
			})
		)
		expect(noteById.read(settled.model, { noteId: "2" })).toEqual(
			AsyncData.Success({ data: { id: "2", body: "hello" } })
		)
	})
})

describe("Query.define field — watch and forget", () => {
	it("informForget while pending writes Idle and returns Interrupt", () => {
		const pending = notes.informLoadIfMissing(notes.init())
		const forgotten = notes.informForget(pending.model)
		expect(forgotten.model).toEqual(AsyncData.Idle())
		expect(forgotten.commands?.map(commandShape)).toEqual([
			commandShape(notes.Fetch.Interrupt((outcome) => notes.Message.CompletedCancelFetch({ outcome }))),
		])
	})

	it("SettledFetch after forget does not resurrect Idle", () => {
		const pending = notes.informLoadIfMissing(notes.init())
		const forgotten = notes.informForget(pending.model)
		const late = notes.update(
			forgotten.model,
			notes.Message.SettledFetch({ result: Result.succeed(hello) })
		)
		expect(late.model).toEqual(AsyncData.Idle())
	})
})

describe("Query watch subscription and run", () => {
	it.effect("watch subscription loads a new key and drops an old one", () =>
		Effect.gen(function* () {
			const ParentModel = Schema.Struct({
				notes: noteById.Model,
				watchedNoteIds: Schema.Array(Schema.String),
			})
			type ParentModel = typeof ParentModel.Type
			const ParentMessage = defineMessageUnion({
				GotNoteMessage: noteById.ParentMessage,
				SetWatchedNoteIds: { noteIds: Schema.Array(Schema.String) },
			})
			type ParentMessage = typeof ParentMessage.Type

			const foldNotes = noteById.lift<ParentModel, ParentMessage>()({
				field: "notes",
				toParentMessage: ParentMessage.GotNoteMessage,
			})

			const update = (model: ParentModel, message: ParentMessage) =>
				ParentMessage.match<Update.Return<ParentModel, ParentMessage>>(message, {
					GotNoteMessage: foldNotes(model),
					SetWatchedNoteIds: ({ noteIds }) => ({
						model: evo(model, { watchedNoteIds: () => noteIds }),
					}),
				})

			const subscriptions = Subscription.make<ParentModel, ParentMessage>()((entry) => ({
				watchNotes: foldNotes.watchSubscription(entry, (model) =>
					Array.map(model.watchedNoteIds, (noteId) => ({ noteId }))
				),
			}))

			const store = yield* Effect.acquireRelease(
				Effect.sync(() =>
					Store.boot(
						{ update, subscriptions },
						{ model: { notes: noteById.init(), watchedNoteIds: ["1", "2"] } }
					)
				),
				(live) => Effect.sync(() => live.dispose())
			)

			const loadedBoth = yield* Store.takeWhen(store, (model) => {
				if (
					AsyncData.isSuccess(noteById.read(model.notes, { noteId: "1" })) &&
					AsyncData.isSuccess(noteById.read(model.notes, { noteId: "2" }))
				) {
					return Option.some(model)
				}
				return Option.none()
			})
			expect(noteById.read(loadedBoth.notes, { noteId: "1" })).toEqual(
				AsyncData.Success({ data: { id: "1", body: "hello" } })
			)
			expect(noteById.read(loadedBoth.notes, { noteId: "2" })).toEqual(
				AsyncData.Success({ data: { id: "2", body: "hello" } })
			)

			store.dispatch(ParentMessage.SetWatchedNoteIds({ noteIds: ["1"] }))

			const dropped = yield* Store.takeWhen(store, (model) =>
				AsyncData.isSuccess(noteById.read(model.notes, { noteId: "1" })) &&
				Option.isNone(HashMap.get(model.notes, "2"))
					? Option.some(model)
					: Option.none()
			)
			expect(noteById.read(dropped.notes, { noteId: "1" })).toEqual(
				AsyncData.Success({ data: { id: "1", body: "hello" } })
			)
			expect(HashMap.get(dropped.notes, "2")).toEqual(Option.none())
		})
	)

	it.effect("Field run settles execute into Success", () =>
		Effect.gen(function* () {
			const data = yield* notes.run
			expect(data).toEqual(AsyncData.Success({ data: hello }))
		})
	)

	it.effect("Field run settles a failed execute into Failure", () =>
		Effect.gen(function* () {
			const failing = Query.define({
				name: "FailingNotes",
				data: Schema.Array(Note),
				error: Schema.String,
				execute: Effect.fail("boom"),
			})
			const data = yield* failing.run
			expect(data).toEqual(AsyncData.Failure({ error: "boom" }))
		})
	)

	it.effect("Keyed run(args) returns settled AsyncData for that slot", () =>
		Effect.gen(function* () {
			const data = yield* noteById.run({ noteId: "1" })
			expect(data).toEqual(AsyncData.Success({ data: { id: "1", body: "hello" } }))
		})
	)
})

describe("Query.Field and Query.Keyed types", () => {
	it("define(field) is Query.Field with the config Name, Model, and Message", () => {
		expectTypeOf(notes).toEqualTypeOf<Query.Field<"Notes", typeof notes.Model, typeof notes.Message>>()
		const takesField = (_query: Query.Field.Any) => undefined
		takesField(notes)
	})

	it("ParentMessage is the Got* fields object for defineMessageUnion", () => {
		expectTypeOf(notes.ParentMessage).toEqualTypeOf<Query.ParentMessage<typeof notes.Message>>()
		expectTypeOf(noteById.ParentMessage).toEqualTypeOf<Query.ParentMessage<typeof noteById.Message>>()
		const Message = defineMessageUnion({
			GotNotesMessage: notes.ParentMessage,
		})
		expect(Message.GotNotesMessage({ message: notes.Message.RequestedWatch() })).toEqual({
			_tag: "GotNotesMessage",
			message: notes.Message.RequestedWatch(),
		})
	})

	it("define(keyed) is Query.Keyed with Name, Model, Message, Fields, and KeyField", () => {
		expectTypeOf(noteById).toEqualTypeOf<
			Query.Keyed<
				"Note",
				typeof noteById.Model,
				typeof noteById.Message,
				{ noteId: typeof Schema.String },
				"noteId",
				AsyncData.AsyncData<Note, string>
			>
		>()
		expectTypeOf(noteByIdPreview.Fetch.Interrupt).parameter(0).toEqualTypeOf<{ readonly noteId: string }>()
		expectTypeOf(noteByIdAndLocale.Fetch.Interrupt).parameter(0).toEqualTypeOf<{
			readonly noteId: string
			readonly locale: string
		}>()
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

	it("lift returns Query.Lifted.Field / Query.Lifted.Keyed", () => {
		const ParentModel = Schema.Struct({ notes: notes.Model })
		type ParentModel = typeof ParentModel.Type
		const ParentMessage = defineMessageUnion({
			GotNotesMessage: notes.ParentMessage,
		})
		type ParentMessage = typeof ParentMessage.Type

		const foldNotes = notes.lift<ParentModel>()({
			field: "notes",
			toParentMessage: ParentMessage.GotNotesMessage,
		})

		expectTypeOf(foldNotes).toMatchTypeOf<
			Query.Lifted.Field<ParentModel, ParentMessage, typeof notes.Message.Type>
		>()
		expectTypeOf(foldNotes).toBeCallableWith({ notes: notes.init() }, {
			message: notes.Message.RequestedWatch(),
		})
		expectTypeOf(foldNotes({ notes: notes.init() })).toBeCallableWith({
			message: notes.Message.RequestedWatch(),
		})

		const KeyedParent = Schema.Struct({ notes: noteById.Model })
		type KeyedParent = typeof KeyedParent.Type
		const KeyedParentMessage = defineMessageUnion({
			GotNoteMessage: noteById.ParentMessage,
		})
		type KeyedParentMessage = typeof KeyedParentMessage.Type

		const foldKeyed = noteById.lift({
			read: function (model: KeyedParent) {
				return Option.some(model.notes)
			},
			write: function (model, nextNotes) {
				return evo(model, { notes: () => nextNotes })
			},
			toParentMessage: function (message) {
				return KeyedParentMessage.GotNoteMessage({ message })
			},
		})

		expectTypeOf(foldKeyed).toMatchTypeOf<
			Query.Lifted.Keyed<KeyedParent, KeyedParentMessage, typeof noteById.Message.Type, { readonly noteId: string }>
		>()
	})

	it("field lift infers ParentMessage from toParentMessage", () => {
		const ParentModel = Schema.Struct({ notes: notes.Model, label: Schema.String })
		type ParentModel = typeof ParentModel.Type
		const ParentMessage = defineMessageUnion({
			GotNotesMessage: notes.ParentMessage,
			ClickedLoad: {},
		})
		type ParentMessage = typeof ParentMessage.Type

		const foldNotes = notes.lift<ParentModel, ParentMessage>()({
			field: "notes",
			toParentMessage: ParentMessage.GotNotesMessage,
		})

		expectTypeOf(foldNotes.revalidate).toEqualTypeOf<Update.Step<ParentModel, ParentMessage>>()
	})

	it("field lift rejects a child Message in place of ParentMessageValue", () => {
		const ParentModel = Schema.Struct({ notes: notes.Model })
		type ParentModel = typeof ParentModel.Type
		const ParentMessage = defineMessageUnion({
			GotNotesMessage: notes.ParentMessage,
		})
		const foldNotes = notes.lift<ParentModel>()({
			field: "notes",
			toParentMessage: ParentMessage.GotNotesMessage,
		})
		const takesChildMessage = function (
			_fold: (
				model: ParentModel,
				message: (typeof notes.Message)["Type"]
			) => Update.Return<ParentModel, unknown>
		) {
			return undefined
		}
		expectTypeOf(foldNotes).toBeCallableWith(
			{ notes: notes.init() },
			{ message: notes.Message.RequestedWatch() }
		)
		// @ts-expect-error
		takesChildMessage(foldNotes)
	})

	it("field lift without ParentModel rejects field", () => {
		notes.lift()({
			// @ts-expect-error
			field: "notes",
			// @ts-expect-error
			toParentMessage: function (message: (typeof notes.Message)["Type"]) {
				return message
			},
		})
	})

	it("field lift rejects a key that is not the query Model", () => {
		type Parent = { notes: (typeof notes.Model)["Type"]; label: string }
		notes.lift<Parent>()({
			// @ts-expect-error
			field: "label",
			toParentMessage: function (fields: { readonly message: (typeof notes.Message)["Type"] }) {
				return fields.message
			},
		})
	})

	it("field lift rejects a Got* constructor whose payload is not the query Message", () => {
		type Parent = { notes: (typeof notes.Model)["Type"] }
		const Message = defineMessageUnion({
			GotNotesMessage: notes.ParentMessage,
		})
		type Message = typeof Message.Type
		const Wrong = defineMessageUnion({
			GotNotesMessage: { message: Schema.String },
		})
		notes.lift<Parent, Message>()({
			field: "notes",
			// @ts-expect-error
			toParentMessage: Wrong.GotNotesMessage,
		})
	})

	it("keyed informLoadIfMissing is Update.Fold over { noteId: string }", () => {
		expectTypeOf(noteById.informLoadIfMissing).toEqualTypeOf<
			Update.Fold<(typeof noteById.Model)["Type"], (typeof noteById.Message)["Type"], { readonly noteId: string }>
		>()
	})

	it("keyed run returns AsyncData, not the HashMap Model", () => {
		expectTypeOf(noteById.run).returns.toEqualTypeOf<Effect.Effect<AsyncData.AsyncData<Note, string>>>()
	})
})
