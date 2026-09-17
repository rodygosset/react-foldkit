import { describe, it } from "@effect/vitest"
import { Effect, HashMap, Latch, Option, Result, Schema } from "effect"
import { expect } from "vitest"
import * as AsyncData from "./asyncData"
import * as Command from "./command"
import * as Query from "./query"
import * as Store from "./store"
import type * as Update from "./update"

const Note = Schema.Struct({ id: Schema.String, body: Schema.String })
type Note = typeof Note.Type

const slotKey = Schema.Unknown.pipe(Schema.toCodecJson, Schema.fromJsonString, Schema.encodeUnknownSync)

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
	execute: function ({ noteId }) {
		return Effect.succeed({ id: noteId, body: "hello" })
	},
})

const hello = [{ id: "1", body: "hello" }]

const commandShape = (command: { readonly name: string; readonly args?: unknown; readonly key?: string }) => ({
	name: command.name,
	args: command.args,
	key: command.key,
})

function bootQueryStore<Model, Message>(
	update: (model: Model, message: Message) => Update.Return<Model, Message>,
	init: Update.Return<Model, Message>
) {
	return Effect.acquireRelease(
		Effect.sync(function () {
			return Store.boot({ update }, init)
		}),
		function (live) {
			return Effect.sync(function () {
				live.dispose()
			})
		}
	)
}

function takeSuccess<Model>(isSuccess: (model: Model) => boolean) {
	return function (current: Model) {
		return isSuccess(current) ? Option.some(current) : Option.none()
	}
}

describe("Query.define — interrupt lifecycle", function () {
	it("informReplace while pending returns Interrupt and keeps Loading", function () {
		const pending = notes.informRevalidateOrLoad(notes.init())
		const replaced = notes.informReplace(pending.model)
		expect(replaced.model).toEqual(AsyncData.Loading())
		expect(replaced.commands?.map(commandShape)).toEqual([
			commandShape(
				notes.Fetch.Interrupt(function (outcome) {
					return notes.Message.CompletedCancelFetch({ outcome, intent: Query.CancelIntent.Replace() })
				})
			),
		])
	})

	it("CompletedCancelFetch Interrupted restarts Fetch on a pending Query", function () {
		const pending = notes.informRevalidateOrLoad(notes.init())
		const restarted = notes.update(
			pending.model,
			notes.Message.CompletedCancelFetch({
				outcome: Command.Interruptible.Outcome.Interrupted(),
				intent: Query.CancelIntent.Replace(),
			})
		)
		expect(restarted.model).toEqual(AsyncData.Loading())
		expect(restarted.commands?.map(commandShape)).toEqual([commandShape(notes.Fetch())])
	})

	it("CompletedCancelFetch NotFound on Idle is a no-op", function () {
		const started = notes.update(
			notes.init(),
			notes.Message.CompletedCancelFetch({
				outcome: Command.Interruptible.Outcome.NotFound(),
				intent: Query.CancelIntent.Replace(),
			})
		)
		expect(started.model).toEqual(AsyncData.Idle())
		expect(started.commands).toBeUndefined()
	})

	it("CompletedCancelFetch NotFound on a pending Query does not start Fetch", function () {
		const pending = notes.informRevalidateOrLoad(notes.init())
		const next = notes.update(
			pending.model,
			notes.Message.CompletedCancelFetch({
				outcome: Command.Interruptible.Outcome.NotFound(),
				intent: Query.CancelIntent.Replace(),
			})
		)
		expect(next.model).toEqual(AsyncData.Loading())
		expect(next.commands).toBeUndefined()
	})

	it("CompletedCancelFetch NotFound on Success does not start Fetch", function () {
		const success = notes.update(AsyncData.Loading(), notes.Message.SettledFetch({ result: Result.succeed(hello) }))
		const next = notes.update(
			success.model,
			notes.Message.CompletedCancelFetch({
				outcome: Command.Interruptible.Outcome.NotFound(),
				intent: Query.CancelIntent.Replace(),
			})
		)
		expect(next.model).toEqual(AsyncData.Success({ data: hello }))
		expect(next.commands).toBeUndefined()
	})

	it.effect("replace through Store.boot interrupts the first fetch and settles the reload", function () {
		return Effect.gen(function* () {
			let attempts = 0
			const deferredNotes = Query.define({
				name: "DeferredNotes",
				data: Schema.Array(Note),
				error: Schema.String,
				execute: Effect.suspend(function () {
					attempts += 1
					if (attempts === 1) return Effect.never
					return Effect.succeed(hello)
				}),
			})

			const store = yield* bootQueryStore(
				deferredNotes.update,
				deferredNotes.informRevalidateOrLoad(deferredNotes.init())
			)

			expect(store.getModel()).toEqual(AsyncData.Loading())
			yield* Effect.yieldNow
			yield* Effect.yieldNow
			store.dispatch(deferredNotes.Message.RequestedReplace())
			const model = yield* Store.takeWhen(
				store,
				takeSuccess(function (current) {
					return AsyncData.isSuccess(current)
				})
			)
			expect(model).toEqual(AsyncData.Success({ data: hello }))
			expect(attempts).toBe(2)
		})
	})

	it.effect("NotFound while a Fetch is in flight lets that Fetch settle and does not start another", function () {
		return Effect.gen(function* () {
			let attempts = 0
			const latch = Latch.makeUnsafe()
			const latchedNotes = Query.define({
				name: "LatchedNotes",
				data: Schema.Array(Note),
				error: Schema.String,
				execute: Effect.suspend(function () {
					attempts += 1
					return Effect.gen(function* () {
						yield* latch.await
						return hello
					})
				}),
			})

			const store = yield* bootQueryStore(
				latchedNotes.update,
				latchedNotes.informRevalidateOrLoad(latchedNotes.init())
			)

			expect(store.getModel()).toEqual(AsyncData.Loading())
			yield* Effect.yieldNow
			yield* Effect.yieldNow
			store.dispatch(
				latchedNotes.Message.CompletedCancelFetch({
					outcome: Command.Interruptible.Outcome.NotFound(),
					intent: Query.CancelIntent.Replace(),
				})
			)
			expect(store.getModel()).toEqual(AsyncData.Loading())
			Effect.runSync(latch.open)
			const model = yield* Store.takeWhen(
				store,
				takeSuccess(function (current) {
					return AsyncData.isSuccess(current)
				})
			)
			expect(model).toEqual(AsyncData.Success({ data: hello }))
			expect(attempts).toBe(1)
		})
	})

	it("Interrupted with forget does not start Fetch after re-watch", function () {
		const pending = notes.informRevalidateOrLoad(notes.init())
		const forgotten = notes.informForget(pending.model)
		const watching = notes.informWatch(forgotten.model)
		expect(watching.model).toEqual(AsyncData.Loading())
		const next = notes.update(
			watching.model,
			notes.Message.CompletedCancelFetch({
				outcome: Command.Interruptible.Outcome.Interrupted(),
				intent: Query.CancelIntent.Forget(),
			})
		)
		expect(next.model).toEqual(AsyncData.Loading())
		expect(next.commands).toBeUndefined()
	})

	it.effect("forget then watch through Store.boot does not start a third Fetch", function () {
		return Effect.gen(function* () {
			let attempts = 0
			const deferredNotes = Query.define({
				name: "ForgetRewatchNotes",
				data: Schema.Array(Note),
				error: Schema.String,
				execute: Effect.suspend(function () {
					attempts += 1
					if (attempts === 1) return Effect.never
					return Effect.succeed(hello)
				}),
			})

			const store = yield* bootQueryStore(
				deferredNotes.update,
				deferredNotes.informRevalidateOrLoad(deferredNotes.init())
			)

			expect(store.getModel()).toEqual(AsyncData.Loading())
			yield* Effect.yieldNow
			yield* Effect.yieldNow
			store.dispatch(deferredNotes.Message.RequestedForget())
			store.dispatch(deferredNotes.Message.RequestedWatch())
			const model = yield* Store.takeWhen(
				store,
				takeSuccess(function (current) {
					return AsyncData.isSuccess(current)
				})
			)
			expect(model).toEqual(AsyncData.Success({ data: hello }))
			expect(attempts).toBe(2)
		})
	})
})

describe("Query.define KeyedQuery — interrupt lifecycle", function () {
	it("replace while pending returns Interrupt for that key only", function () {
		const pendingOne = noteById.informLoadIfMissing(noteById.init(), { noteId: "1" })
		const bothPending = noteById.informLoadIfMissing(pendingOne.model, { noteId: "2" })
		const replaced = noteById.informReplace(bothPending.model, { noteId: "1" })
		expect(noteById.read(replaced.model, { noteId: "1" })).toEqual(AsyncData.Loading())
		expect(noteById.read(replaced.model, { noteId: "2" })).toEqual(AsyncData.Loading())
		expect(replaced.commands?.map(commandShape)).toEqual([
			commandShape(
				noteById.Fetch.Interrupt({ noteId: "1" }, function (outcome) {
					return noteById.Message.CompletedCancelFetch({
						args: { noteId: "1" },
						outcome,
						intent: Query.CancelIntent.Replace(),
					})
				})
			),
		])
	})

	it("CompletedCancelFetch Interrupted restarts Fetch on a pending key", function () {
		const pending = noteById.informLoadIfMissing(noteById.init(), { noteId: "1" })
		const restarted = noteById.update(
			pending.model,
			noteById.Message.CompletedCancelFetch({
				args: { noteId: "1" },
				outcome: Command.Interruptible.Outcome.Interrupted(),
				intent: Query.CancelIntent.Replace(),
			})
		)
		expect(noteById.read(restarted.model, { noteId: "1" })).toEqual(AsyncData.Loading())
		expect(restarted.commands?.map(commandShape)).toEqual([commandShape(noteById.Fetch({ noteId: "1" }))])
	})

	it("CompletedCancelFetch NotFound on a missing key is a no-op", function () {
		const started = noteById.update(
			noteById.init(),
			noteById.Message.CompletedCancelFetch({
				args: { noteId: "1" },
				outcome: Command.Interruptible.Outcome.NotFound(),
				intent: Query.CancelIntent.Replace(),
			})
		)
		expect(HashMap.isEmpty(started.model)).toBe(true)
		expect(started.commands).toBeUndefined()
	})

	it("CompletedCancelFetch NotFound on a pending key does not start Fetch", function () {
		const pending = noteById.informLoadIfMissing(noteById.init(), { noteId: "1" })
		const next = noteById.update(
			pending.model,
			noteById.Message.CompletedCancelFetch({
				args: { noteId: "1" },
				outcome: Command.Interruptible.Outcome.NotFound(),
				intent: Query.CancelIntent.Replace(),
			})
		)
		expect(noteById.read(next.model, { noteId: "1" })).toEqual(AsyncData.Loading())
		expect(next.commands).toBeUndefined()
	})
})

describe("Query.define — watch and forget", function () {
	it("informForget while pending writes Idle and returns Interrupt", function () {
		const pending = notes.informLoadIfMissing(notes.init())
		const forgotten = notes.informForget(pending.model)
		expect(forgotten.model).toEqual(AsyncData.Idle())
		expect(forgotten.commands?.map(commandShape)).toEqual([
			commandShape(
				notes.Fetch.Interrupt(function (outcome) {
					return notes.Message.CompletedCancelFetch({ outcome, intent: Query.CancelIntent.Forget() })
				})
			),
		])
	})

	it("SettledFetch after forget does not resurrect Idle; after re-watch it writes", function () {
		const pending = notes.informLoadIfMissing(notes.init())
		const forgotten = notes.informForget(pending.model)
		const late = notes.update(forgotten.model, notes.Message.SettledFetch({ result: Result.succeed(hello) }))
		expect(late.model).toEqual(AsyncData.Idle())

		const watching = notes.informWatch(late.model)
		expect(watching.model).toEqual(AsyncData.Loading())
		const settled = notes.update(watching.model, notes.Message.SettledFetch({ result: Result.succeed(hello) }))
		expect(settled.model).toEqual(AsyncData.Success({ data: hello }))
	})
})

describe("Query.define KeyedQuery — watch and forget", function () {
	it("informWatch from [1, 2] then [1] drops key 2 and Interrupts the pending fetch", function () {
		const both = noteById.informWatch(noteById.init(), [{ noteId: "1" }, { noteId: "2" }])
		expect(noteById.read(both.model, { noteId: "1" })).toEqual(AsyncData.Loading())
		expect(noteById.read(both.model, { noteId: "2" })).toEqual(AsyncData.Loading())
		expect(both.commands?.map(commandShape)).toEqual([
			commandShape(noteById.Fetch({ noteId: "1" })),
			commandShape(noteById.Fetch({ noteId: "2" })),
		])

		const onlyOne = noteById.informWatch(both.model, [{ noteId: "1" }])
		expect(noteById.read(onlyOne.model, { noteId: "1" })).toEqual(AsyncData.Loading())
		expect(HashMap.get(onlyOne.model, slotKey({ noteId: "2" }))).toEqual(Option.none())
		expect(onlyOne.commands?.map(commandShape)).toEqual([
			commandShape(
				noteById.Fetch.Interrupt({ noteId: "2" }, function (outcome) {
					return noteById.Message.CompletedCancelFetch({
						args: { noteId: "2" },
						outcome,
						intent: Query.CancelIntent.Forget(),
					})
				})
			),
		])
	})

	it("informForget while pending removes the key and returns Interrupt", function () {
		const pending = noteById.informLoadIfMissing(noteById.init(), { noteId: "2" })
		const forgotten = noteById.informForget(pending.model, { noteId: "2" })
		expect(HashMap.get(forgotten.model, slotKey({ noteId: "2" }))).toEqual(Option.none())
		expect(forgotten.commands?.map(commandShape)).toEqual([
			commandShape(
				noteById.Fetch.Interrupt({ noteId: "2" }, function (outcome) {
					return noteById.Message.CompletedCancelFetch({
						args: { noteId: "2" },
						outcome,
						intent: Query.CancelIntent.Forget(),
					})
				})
			),
		])
	})

	it("SettledFetch after forget does not reinsert the key", function () {
		const pending = noteById.informLoadIfMissing(noteById.init(), { noteId: "1" })
		const forgotten = noteById.informForget(pending.model, { noteId: "1" })
		const late = noteById.update(
			forgotten.model,
			noteById.Message.SettledFetch({
				args: { noteId: "1" },
				result: Result.succeed({ id: "1", body: "hello" }),
			})
		)
		expect(HashMap.get(late.model, slotKey({ noteId: "1" }))).toEqual(Option.none())
		expect(HashMap.isEmpty(late.model)).toBe(true)
	})

	it("SettledFetch after watch-drop does not reinsert; after re-watch it writes", function () {
		const both = noteById.informWatch(noteById.init(), [{ noteId: "1" }, { noteId: "2" }])
		const dropped = noteById.informWatch(both.model, [{ noteId: "1" }])
		const late = noteById.update(
			dropped.model,
			noteById.Message.SettledFetch({
				args: { noteId: "2" },
				result: Result.succeed({ id: "2", body: "hello" }),
			})
		)
		expect(HashMap.get(late.model, slotKey({ noteId: "2" }))).toEqual(Option.none())

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

describe("Query.define KeyedQuery — Store interrupt", function () {
	it.effect("replace through Store.boot interrupts one slot and leaves the sibling pending", function () {
		return Effect.gen(function* () {
			const attempts: globalThis.Record<string, number> = {}
			const deferredNotes = Query.define({
				name: "DeferredNote",
				data: Note,
				error: Schema.String,
				args: { noteId: Schema.String },
				execute: function ({ noteId }) {
					return Effect.suspend(function () {
						attempts[noteId] = (attempts[noteId] ?? 0) + 1
						if (attempts[noteId] === 1) return Effect.never
						return Effect.succeed({ id: noteId, body: "hello" })
					})
				},
			})

			const started = deferredNotes.informWatch(deferredNotes.init(), [{ noteId: "1" }, { noteId: "2" }])
			const store = yield* bootQueryStore(deferredNotes.update, started)

			yield* Effect.yieldNow
			yield* Effect.yieldNow
			store.dispatch(deferredNotes.Message.RequestedReplace({ args: { noteId: "1" } }))

			const model = yield* Store.takeWhen(store, function (current) {
				const first = deferredNotes.read(current, { noteId: "1" })
				const second = deferredNotes.read(current, { noteId: "2" })
				if (AsyncData.isSuccess(first) && AsyncData.isLoading(second)) return Option.some(current)
				return Option.none()
			})

			expect(deferredNotes.read(model, { noteId: "1" })).toEqual(
				AsyncData.Success({ data: { id: "1", body: "hello" } })
			)
			expect(deferredNotes.read(model, { noteId: "2" })).toEqual(AsyncData.Loading())
			expect(attempts["1"]).toBe(2)
			expect(attempts["2"]).toBe(1)
		})
	})

	it.effect("watch-drop then re-watch through Store.boot does not start a third Fetch", function () {
		return Effect.gen(function* () {
			const attempts: globalThis.Record<string, number> = {}
			const deferredNotes = Query.define({
				name: "ForgetRewatchNote",
				data: Note,
				error: Schema.String,
				args: { noteId: Schema.String },
				execute: function ({ noteId }) {
					return Effect.suspend(function () {
						attempts[noteId] = (attempts[noteId] ?? 0) + 1
						if (attempts[noteId] === 1) return Effect.never
						return Effect.succeed({ id: noteId, body: "hello" })
					})
				},
			})

			const started = deferredNotes.informWatch(deferredNotes.init(), [{ noteId: "1" }])
			const store = yield* bootQueryStore(deferredNotes.update, started)

			yield* Effect.yieldNow
			yield* Effect.yieldNow
			store.dispatch(deferredNotes.Message.RequestedWatch({ live: HashMap.empty() }))
			store.dispatch(
				deferredNotes.Message.RequestedWatch({
					live: HashMap.make([slotKey({ noteId: "1" }), { noteId: "1" }]),
				})
			)

			const model = yield* Store.takeWhen(
				store,
				takeSuccess(function (current) {
					return AsyncData.isSuccess(deferredNotes.read(current, { noteId: "1" }))
				})
			)
			expect(deferredNotes.read(model, { noteId: "1" })).toEqual(
				AsyncData.Success({ data: { id: "1", body: "hello" } })
			)
			expect(attempts["1"]).toBe(2)
		})
	})
})
