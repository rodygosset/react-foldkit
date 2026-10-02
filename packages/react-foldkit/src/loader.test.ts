// @vitest-environment node

import { Context, Deferred, Effect, Layer, ManagedRuntime, Result, Schema } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"
import * as AsyncData from "./asyncData"
import * as Loader from "./loader"
import * as Query from "./query"

const Data = Schema.Struct({ id: Schema.String, at: Schema.DateFromString })
type Data = typeof Data.Type
const data: Data = { id: "a", at: new Date("2026-10-01T12:00:00Z") }
const RecordLoader = Loader.define({ name: "Record", data: Data, key: function ({ id }) { return id } })

afterEach(() => vi.restoreAllMocks())

describe("Loader declarations", () => {
	it("loads lazily, encodes native Schema values, and allocates one token per execution", () => {
		const tokens = vi.spyOn(crypto, "randomUUID")
		const input = vi.fn(() => data)
		const program = RecordLoader.load(Effect.sync(input))
		expect(input).not.toHaveBeenCalled()
		expect(tokens).not.toHaveBeenCalled()
		const first = Effect.runSync(program)
		const second = Effect.runSync(program)
		expect(first.payload).toEqual({ id: "a", at: data.at.toISOString() })
		expect(first.version).not.toBe(second.version)
		expect(input).toHaveBeenCalledTimes(2)
		expect(tokens).toHaveBeenCalledTimes(2)
		expect(RecordLoader.decode(first)).toEqual(data)
		expect(RecordLoader.decode(JSON.parse(JSON.stringify(first)))).toEqual(data)
		expect(tokens).toHaveBeenCalledTimes(2)
	})

	it("supports dual Loader.load and composes mapMessages with unchanged receipt identity", () => {
		const root = RecordLoader.pipe(
			Loader.mapMessages(function (message, receipt) {
				return { message, receipt }
			}),
			Loader.mapMessages(function (message, receipt) {
				return { _tag: "Root" as const, ...message, latest: receipt }
			})
		)
		const envelope = Effect.runSync(Loader.load(root, Effect.succeed(data)))
		const message = root.decode(envelope)
		expect(root.load).toBe(RecordLoader.load)
		expect(root.data).toBe(RecordLoader.data)
		expect(message.receipt).toEqual({ name: "Record", key: "a", version: envelope.version })
		expect(message.latest).toBe(message.receipt)
		expect(message.message).toEqual(data)
		expect(Schema.decodeUnknownSync(Loader.Receipt)(message.receipt)).toEqual(message.receipt)
	})

	it("preserves input failures and encoding failures without allocating tokens", () => {
		const tokens = vi.spyOn(crypto, "randomUUID")
		expect(Effect.runSync(Effect.result(RecordLoader.load(Effect.fail("unavailable"))))).toEqual(
			Result.fail("unavailable")
		)
		const invalid = RecordLoader.load(Effect.succeed({ ...data, at: new Date(NaN) }))
		const result = Effect.runSync(Effect.result(invalid))
		expect(result._tag).toBe("Failure")
		if (result._tag === "Failure") expect(Schema.isSchemaError(result.failure)).toBe(true)
		expect(tokens).not.toHaveBeenCalled()
	})

	it("rejects resource keys that do not match the decoded payload", () => {
		const envelope = Effect.runSync(RecordLoader.load(Effect.succeed(data)))
		expect(() => RecordLoader.decode({ ...envelope, key: "another-resource" })).toThrow(/resource key/)
	})
})

describe("Loader.fromQuery", () => {
	const keyed = Query.define({
		name: "Project",
		args: { projectId: Schema.String },
		toKey: function ({ projectId }) {
			return projectId
		},
		data: Schema.Struct({ id: Schema.String, revision: Schema.Number }),
		error: Schema.String,
		execute: function ({ projectId }) {
			return Effect.succeed({ id: projectId, revision: 1 })
		},
	})
	const ProjectLoader = Loader.fromQuery(keyed)

	it("derives Load schema and key from a keyed Query", () => {
		const result = AsyncData.Success({ data: { id: "p1", revision: 1 } })
		const envelope = Effect.runSync(ProjectLoader.loadQuery({ projectId: "p1" }))
		const dual = Effect.runSync(Loader.loadQuery(ProjectLoader, { projectId: "p1" }))
		expect(dual.name).toBe(envelope.name)
		expect(dual.key).toBe(envelope.key)
		expect(dual.payload).toEqual(envelope.payload)
		expect(envelope.name).toBe("Project")
		expect(envelope.key).toBe("p1")
		expect(envelope._tag).toBe("react-foldkit/Loader")
		expect(ProjectLoader.Load.fields.result).toBe(keyed.AsyncData.schema)
		expect(ProjectLoader.decode(envelope)).toEqual({ projectId: "p1", result })
		expect(
			Loader.settleIfLoadKeyed(keyed, keyed.init("home"), { projectId: "p1", result }, {
				fresher: function () {
					return true
				},
			}).model
		).toEqual(
			keyed.settleIf(keyed.init("home"), { projectId: "p1" }, result, {
				fresher: function () {
					return true
				},
			}).model
		)
		expect(Schema.decodeUnknownSync(ProjectLoader.Load)({ projectId: "p1", result })).toEqual({
			projectId: "p1",
			result,
		})
	})

	it("requires a resource key for a Query", () => {
		const query = Query.define({
			name: "Home",
			data: Schema.String,
			error: Schema.String,
			execute: Effect.succeed("home"),
		})
		const HomeLoader = Loader.fromQuery(query, {
			key: function () {
				return "home"
			},
		})
		const result = AsyncData.Success({ data: "home" })
		const envelope = Effect.runSync(HomeLoader.load(Effect.succeed({ result })))
		expect(envelope.name).toBe("Home")
		expect(envelope.key).toBe("home")
		expect(HomeLoader.decode(envelope)).toEqual({ result })
		expect(
			Loader.settleIfLoad(query, query.init("home"), { result }, {
				fresher: function () {
					return true
				},
			}).model
		).toEqual(
			query.settleIf(query.init("home"), result, {
				fresher: function () {
					return true
				},
			}).model
		)
		expect(function () {
			return Loader.fromQuery(query as never)
		}).toThrow(/require options\.key/)
	})
})

class Reader extends Context.Service<Reader, { readonly read: Effect.Effect<Data> }>()("LoaderTest/Reader") {}

describe("host-owned Effect execution", () => {
	it("acquires services lazily, reuses them within a runtime, and isolates requests", async () => {
		let acquired = 0
		let released = 0
		const runtime = function (id: string) {
			return ManagedRuntime.make(
				Layer.effect(
					Reader,
					Effect.acquireRelease(
						Effect.sync(function () {
							acquired += 1
							return { read: Effect.succeed({ ...data, id }) }
						}),
						function () {
							return Effect.sync(function () {
								released += 1
							})
						}
					)
				)
			)
		}
		const first = runtime("first")
		const second = runtime("second")
		const program = RecordLoader.load(Effect.flatMap(Reader, function (reader) { return reader.read }))
		expect(acquired).toBe(0)
		try {
			expect((await first.runPromise(program)).key).toBe("first")
			expect((await first.runPromise(program)).key).toBe("first")
			expect((await second.runPromise(program)).key).toBe("second")
			expect(acquired).toBe(2)
			expect(released).toBe(0)
		} finally {
			await first.dispose()
			await second.dispose()
		}
		expect(released).toBe(2)
	})

	it("forwards host abortion without disposing the shared runtime", async () => {
		const started = Deferred.makeUnsafe<void>()
		let interrupted = false
		let released = false
		const runtime = ManagedRuntime.make(
			Layer.effect(
				Reader,
				Effect.acquireRelease(Effect.succeed({ read: Effect.succeed(data) }), function () {
					return Effect.sync(function () {
						released = true
					})
				})
			)
		)
		const input = Effect.gen(function* () {
			yield* Reader
			yield* Deferred.succeed(started, undefined)
			return yield* Effect.never
		}).pipe(
			Effect.onInterrupt(function () {
				return Effect.sync(function () {
					interrupted = true
				})
			})
		)
		const controller = new AbortController()
		try {
			const result = runtime.runPromise(RecordLoader.load(input), { signal: controller.signal })
			const rejected = expect(result).rejects.toBeDefined()
			await Effect.runPromise(Deferred.await(started))
			controller.abort()
			await rejected
			expect(interrupted).toBe(true)
			expect(released).toBe(false)
			expect(
				(
					await runtime.runPromise(
						RecordLoader.load(Effect.flatMap(Reader, function (reader) { return reader.read }))
					)
				).key
			).toBe("a")
		} finally {
			await runtime.dispose()
		}
		expect(released).toBe(true)
	})

	it("leaves runtime initialization failures at the host execution boundary", async () => {
		const runtime = ManagedRuntime.make(Layer.effect(Reader, Effect.fail("initialization failed")))
		try {
			await expect(
				runtime.runPromise(RecordLoader.load(Effect.flatMap(Reader, function (reader) { return reader.read })))
			).rejects.toThrow(/initialization failed/)
		} finally {
			await runtime.dispose()
		}
	})
})
