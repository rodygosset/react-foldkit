import { toJSON, fromJSON } from "seroval"
import {
	DateTime,
	HashMap,
	Option,
	Context,
	Deferred,
	Effect,
	Exit,
	Layer,
	ManagedRuntime,
	Result,
	Schema,
} from "effect"
import { describe, it } from "@effect/vitest"
import { afterEach, expect, vi } from "vitest"
import * as AsyncData from "./asyncData"
import * as Loader from "./loader"
import * as Query from "foldkit/experimental/query"

const Data = Schema.Struct({ id: Schema.String, at: Schema.DateFromString })
type Data = typeof Data.Type
const data: Data = { id: "a", at: DateTime.toDateUtc(DateTime.makeUnsafe("2026-10-01T12:00:00Z")) }
const RecordLoader = Loader.define({ name: "Record", data: Data, key: ({ id }) => id })

afterEach(() => vi.restoreAllMocks())

describe("Loader declarations", function () {
	it.effect("transports native Option and HashMap values through JSON and Seroval", () =>
		Effect.gen(function* () {
			const Data = Schema.Struct({
				id: Schema.Option(Schema.String),
				values: Schema.HashMap(Schema.String, Schema.Finite),
			})
			const value = {
				id: Option.some("a"),
				values: HashMap.make(["count", 2]),
			}
			const loader = Loader.define({
				name: "Native",
				data: Data,
				key: ({ id }) => Option.getOrElse(id, () => "none"),
			}).pipe(Loader.mapMessages((data, receipt) => ({ data, receipt })))
			const envelope = yield* loader.load(Effect.succeed(value))
			const Json = Schema.fromJsonString(Schema.Json)
			const transportedJson = yield* Schema.decodeEffect(Json)(yield* Schema.encodeEffect(Json)(envelope))
			for (const transported of [transportedJson, fromJSON(toJSON(envelope))]) {
				const delivery = Result.getOrThrow(loader.decodeDelivery(transported))
				expect(delivery.message.data.id).toEqual(Option.some("a"))
				expect(Array.from(delivery.message.data.values)).toEqual([["count", 2]])
				expect(delivery.receipt).toEqual({
					name: "Native",
					key: "a",
					version: envelope.version,
				})
			}
			expect(
				Result.isFailure(
					loader.decode({
						...envelope,
						payload: { id: { _tag: "Some", value: 42 }, values: [] },
					})
				)
			).toBe(true)
		})
	)

	it.effect("reports schemas without a compatible JSON representation as encoding failures", () =>
		Effect.gen(function* () {
			const loader = Loader.define({
				name: "Unknown",
				data: Schema.Unknown,
				key: () => "one",
			})
			const result = yield* Effect.result(loader.load(Effect.succeed(() => "not JSON")))
			expect(Result.isFailure(result)).toBe(true)
			if (Result.isFailure(result)) expect(Schema.isSchemaError(result.failure)).toBe(true)
			const envelope = yield* loader.load(Effect.succeed({ value: "JSON" }))
			expect(Result.getOrThrow(loader.decode(envelope))).toEqual({
				value: "JSON",
			})
		})
	)

	it.effect("keeps a SchemaError thrown by a custom key callback as a defect", () =>
		Effect.gen(function* () {
			const invalid = Schema.decodeUnknownResult(Schema.Finite)("invalid")
			if (Result.isSuccess(invalid)) throw new Error("Expected invalid numeric input")
			const defect = invalid.failure
			const loader = Loader.define({
				name: "Record",
				data: Data,
				key() {
					throw defect
				},
			})
			expect(yield* Effect.exit(loader.load(Effect.succeed(data)))).toEqual(Exit.die(defect))
			const envelope = yield* RecordLoader.load(Effect.succeed(data))
			expect(() => loader.decodeDelivery(envelope)).toThrow(defect)
		})
	)

	it.effect("returns the validated receipt shared with the mapped Message", () =>
		Effect.gen(function* () {
			const envelope = yield* RecordLoader.load(Effect.succeed(data))
			const mapped = RecordLoader.pipe(Loader.mapMessages((value, receipt) => ({ value, receipt })))
			const delivery = Result.getOrThrow(mapped.decodeDelivery(envelope))
			expect(delivery.receipt).toEqual({ name: "Record", key: "a", version: envelope.version })
			expect(delivery.message.value).toEqual(data)
			expect(delivery.message.receipt).toBe(delivery.receipt)
			expect(Result.isFailure(mapped.decodeDelivery({ ...envelope, key: "other" }))).toBe(true)
		})
	)

	it.effect("maps structural Loaders through decoded deliveries without a payload mapping field", () =>
		Effect.gen(function* () {
			const decodeDelivery = (input: unknown) =>
				Result.map(RecordLoader.decodeDelivery(input), ({ receipt, message }) => ({
					receipt,
					message: message.id,
				}))
			const structural: Loader.Loader<Data, Schema.Json, string> = {
				name: RecordLoader.name,
				data: RecordLoader.data,
				key: RecordLoader.key,
				load: RecordLoader.load,
				pipe: RecordLoader.pipe,
				decodeDelivery,
				decode: (input) => Result.map(decodeDelivery(input), (delivery) => delivery.message),
			}
			const mapped = Loader.mapMessages(structural, (id, receipt) => ({ label: `record ${id}`, receipt })).pipe(
				Loader.mapMessages((message, receipt) => ({ ...message, label: `${message.label}!`, latest: receipt }))
			)
			const envelope = yield* mapped.load(Effect.succeed(data))
			const delivery = Result.getOrThrow(mapped.decodeDelivery(envelope))
			expect(delivery.message.label).toBe("record a!")
			expect(delivery.receipt).toEqual({ name: "Record", key: "a", version: envelope.version })
			expect(delivery.message.receipt).toBe(delivery.receipt)
			expect(delivery.message.latest).toBe(delivery.receipt)
			expect(Result.getOrThrow(mapped.decode(envelope)).label).toBe("record a!")
			expect(envelope.payload).toEqual({ id: "a", at: "2026-10-01T12:00:00.000Z" })
		})
	)

	it.effect("loads lazily, encodes native Schema values, and allocates one token per execution", () =>
		Effect.gen(function* () {
			const tokens = vi.spyOn(crypto, "getRandomValues")
			const input = vi.fn(() => data)
			const program = RecordLoader.load(Effect.sync(input))
			expect(input).not.toHaveBeenCalled()
			expect(tokens).not.toHaveBeenCalled()
			const first = yield* program
			const second = yield* program
			expect(first.payload).toEqual({ id: "a", at: data.at.toISOString() })
			expect(first.version).not.toBe(second.version)
			expect(first.version).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i)
			expect(input).toHaveBeenCalledTimes(2)
			expect(tokens).toHaveBeenCalledTimes(2)
			expect(Result.getOrThrow(RecordLoader.decode(first))).toEqual(data)
			const Json = Schema.fromJsonString(Schema.Unknown)
			const transported = yield* Schema.decodeEffect(Json)(yield* Schema.encodeEffect(Json)(first))
			expect(Result.getOrThrow(RecordLoader.decode(transported))).toEqual(data)
			expect(tokens).toHaveBeenCalledTimes(2)
		})
	)

	it.effect("keeps secure randomness failures as defects", () =>
		Effect.gen(function* () {
			const defect = new Error("secure randomness unavailable")
			vi.spyOn(crypto, "getRandomValues").mockImplementation(function () {
				throw defect
			})
			expect(yield* Effect.exit(RecordLoader.load(Effect.succeed(data)))).toEqual(Exit.die(defect))
		})
	)

	it.effect("supports dual Loader.load and composes mapMessages with unchanged receipt identity", () =>
		Effect.gen(function* () {
			const root = RecordLoader.pipe(
				Loader.mapMessages((message, receipt) => ({ message, receipt })),
				Loader.mapMessages((message, receipt) => ({ _tag: "Root" as const, ...message, latest: receipt }))
			)
			const envelope = yield* Loader.load(root, Effect.succeed(data))
			const message = Result.getOrThrow(root.decode(envelope))
			expect(root.load).toBe(RecordLoader.load)
			expect(root.data).toBe(RecordLoader.data)
			expect(message.receipt).toEqual({ name: "Record", key: "a", version: envelope.version })
			expect(message.latest).toBe(message.receipt)
			expect(message.message).toEqual(data)
			expect(yield* Schema.decodeEffect(Loader.Receipt)(message.receipt)).toEqual(message.receipt)
		})
	)

	it.effect("preserves input failures and encoding failures without allocating tokens", () =>
		Effect.gen(function* () {
			const tokens = vi.spyOn(crypto, "getRandomValues")
			expect(yield* Effect.result(RecordLoader.load(Effect.fail("unavailable")))).toEqual(
				Result.fail("unavailable")
			)
			const invalidDate = DateTime.toDateUtc(DateTime.makeUnsafe(0))
			invalidDate.setTime(NaN)
			const invalid = RecordLoader.load(Effect.succeed({ ...data, at: invalidDate }))
			const result = yield* Effect.result(invalid)
			expect(result._tag).toBe("Failure")
			if (result._tag === "Failure") expect(Schema.isSchemaError(result.failure)).toBe(true)
			expect(tokens).not.toHaveBeenCalled()
		})
	)

	it.effect("repeats key validation and Message mapping on every decode", () =>
		Effect.gen(function* () {
			const envelope = yield* RecordLoader.load(Effect.succeed(data))
			const key = vi.fn(({ id }: Data) => id)
			const mapping = vi.fn((value: Data) => value.id)
			const loader = Loader.define({ name: "Record", data: Data, key }).pipe(Loader.mapMessages(mapping))
			expect(key).not.toHaveBeenCalled()
			expect(mapping).not.toHaveBeenCalled()
			expect(Result.getOrThrow(loader.decode(envelope))).toBe("a")
			expect(Result.getOrThrow(loader.decode(envelope))).toBe("a")
			expect(key).toHaveBeenCalledTimes(2)
			expect(mapping).toHaveBeenCalledTimes(2)
		})
	)

	it.effect("rejects resource keys that do not match the decoded payload", () =>
		Effect.gen(function* () {
			const envelope = yield* RecordLoader.load(Effect.succeed(data))
			const decoded = RecordLoader.decode({ ...envelope, key: "another-resource" })
			expect(Result.isFailure(decoded)).toBe(true)
			if (Result.isFailure(decoded)) expect(decoded.failure.message).toContain("resource key")
		})
	)
	it.effect("surfaces key and Message mapping defects as thrown defects", () =>
		Effect.gen(function* () {
			const envelope = yield* RecordLoader.load(Effect.succeed(data))
			const defect = new Error("callback failed")
			const mapped = RecordLoader.pipe(
				Loader.mapMessages(function () {
					throw defect
				})
			)
			const key = Loader.define({
				name: "Record",
				data: Data,
				key() {
					throw defect
				},
			})
			for (const loader of [mapped, key]) {
				expect(() => loader.decode(envelope)).toThrow(defect)
			}
		})
	)
})

describe("Loader.fromQuery", function () {
	it.effect("derives JSON transport for native query arguments, successes, and failures", () =>
		Effect.gen(function* () {
			const query = Query.define({
				name: "NativeQuery",
				args: { id: Schema.Option(Schema.String) },
				data: Schema.HashMap(Schema.String, Schema.Finite),
				error: Schema.Option(Schema.String),
				execute: ({ id }) =>
					Option.isSome(id)
						? Effect.succeed(HashMap.make(["count", 2]))
						: Effect.fail(Option.some("missing")),
			})
			const loader = Loader.fromQuery(query)
			const success = yield* loader.loadQuery({ id: Option.some("a") })
			const failure = yield* loader.loadQuery({ id: Option.none() })
			for (const transport of [
				(input: unknown) => JSON.parse(JSON.stringify(input)),
				(input: unknown) => fromJSON(toJSON(input)),
			]) {
				const decoded = Result.getOrThrow(loader.decode(transport(success)))
				expect(decoded.args.id).toEqual(Option.some("a"))
				expect(AsyncData.isSuccess(decoded.result)).toBe(true)
				if (AsyncData.isSuccess(decoded.result)) expect(Array.from(decoded.result.data)).toEqual([["count", 2]])
				expect(Result.getOrThrow(loader.decode(transport(failure)))).toEqual({
					args: { id: Option.none() },
					result: AsyncData.Failure({ error: Option.some("missing") }),
				})
			}
		})
	)

	it.effect("defers keyed query construction until each execution and captures throws as defects", () =>
		Effect.gen(function* () {
			let calls = 0
			const query = Query.define({
				name: "Lazy",
				args: { id: Schema.String },
				data: Schema.Finite,
				error: Schema.String,
				execute() {
					calls += 1
					return Effect.succeed(calls)
				},
			})
			const loader = Loader.fromQuery(query)
			const program = loader.loadQuery({ id: "a" })
			expect(calls).toBe(0)
			expect(Result.getOrThrow(loader.decode(yield* program))).toEqual({
				args: { id: "a" },
				result: AsyncData.Success({ data: 1 }),
			})
			expect(Result.getOrThrow(loader.decode(yield* program))).toEqual({
				args: { id: "a" },
				result: AsyncData.Success({ data: 2 }),
			})
			const defect = new Error("execute callback defect")
			const throwing = Loader.fromQuery(
				Query.define({
					name: "Throwing",
					args: { id: Schema.String },
					data: Schema.String,
					error: Schema.String,
					execute() {
						throw defect
					},
				})
			)
			const failed = throwing.loadQuery({ id: "a" })
			expect(yield* Effect.exit(failed)).toEqual(Exit.die(defect))
		})
	)

	const keyed = Query.define({
		name: "Project",
		args: { projectId: Schema.String },
		toKey: ({ projectId }) => projectId,
		data: Schema.Struct({ id: Schema.String, revision: Schema.Finite }),
		error: Schema.String,
		execute: ({ projectId }) => Effect.succeed({ id: projectId, revision: 1 }),
	})
	const ProjectLoader = Loader.fromQuery(keyed, {
		name: "Project",
		key: ({ projectId }) => projectId,
	})

	it.effect("derives keyed serialization while allowing identity overrides", () =>
		Effect.gen(function* () {
			const result = AsyncData.Success({ data: { id: "p1", revision: 1 } })
			const envelope = yield* ProjectLoader.loadQuery({ projectId: "p1" })
			const dual = yield* Loader.loadQuery(ProjectLoader, { projectId: "p1" })
			expect(dual.name).toBe(envelope.name)
			expect(dual.key).toBe(envelope.key)
			expect(dual.payload).toEqual(envelope.payload)
			expect(envelope.name).toBe("Project")
			expect(envelope.key).toBe("p1")
			expect(envelope._tag).toBe("react-foldkit/Loader")
			expect(Result.getOrThrow(ProjectLoader.decode(envelope))).toEqual({ args: { projectId: "p1" }, result })
			expect(yield* Schema.decodeEffect(ProjectLoader.Load)({ args: { projectId: "p1" }, result })).toEqual({
				args: { projectId: "p1" },
				result,
			})
		})
	)

	it.effect("allows a name override for a plain Query and keeps the singleton key", () =>
		Effect.gen(function* () {
			const query = Query.define({
				name: "Home",
				data: Schema.String,
				error: Schema.String,
				execute: Effect.succeed("home"),
			})
			const HomeLoader = Loader.fromQuery(query, { name: "Home" })
			const result = AsyncData.Success({ data: "home" })
			const envelope = yield* HomeLoader.load(Effect.succeed({ result }))
			expect(envelope.name).toBe("Home")
			// A plain Query has no arguments to key on, so its identity is always singleton.
			expect(envelope.key).toBe("singleton")
			expect(Result.getOrThrow(HomeLoader.decode(envelope))).toEqual({ result })
		})
	)
})

class Reader extends Context.Service<Reader, { readonly read: Effect.Effect<Data> }>()("LoaderTest/Reader") {}

describe("host-owned Effect execution", function () {
	it.live("acquires services lazily, reuses them within a runtime, and isolates requests", () =>
		Effect.gen(function* () {
			let acquired = 0
			let released = 0
			const runtime = (id: string) =>
				ManagedRuntime.make(
					Layer.effect(
						Reader,
						Effect.acquireRelease(
							Effect.sync(function () {
								acquired += 1
								return { read: Effect.succeed({ ...data, id }) }
							}),
							() =>
								Effect.sync(function () {
									released += 1
								})
						)
					)
				)
			const first = runtime("first")
			const second = runtime("second")
			const program = RecordLoader.load(Effect.flatMap(Reader, (reader) => reader.read))
			expect(acquired).toBe(0)
			try {
				expect((yield* Effect.promise(() => first.runPromise(program))).key).toBe("first")
				expect((yield* Effect.promise(() => first.runPromise(program))).key).toBe("first")
				expect((yield* Effect.promise(() => second.runPromise(program))).key).toBe("second")
				expect(acquired).toBe(2)
				expect(released).toBe(0)
			} finally {
				yield* Effect.promise(() => first.dispose())
				yield* Effect.promise(() => second.dispose())
			}
			expect(released).toBe(2)
		})
	)

	it("forwards host abortion without disposing the shared runtime", function () {
		const controller = new AbortController()
		return Effect.runPromise(
			Effect.gen(function* () {
				const started = Deferred.makeUnsafe<void>()
				let interrupted = false
				let released = false
				const runtime = ManagedRuntime.make(
					Layer.effect(
						Reader,
						Effect.acquireRelease(Effect.succeed({ read: Effect.succeed(data) }), () =>
							Effect.sync(function () {
								released = true
							})
						)
					)
				)
				const input = Effect.gen(function* () {
					yield* Reader
					yield* Deferred.succeed(started, undefined)
					return yield* Effect.never
				}).pipe(
					Effect.onInterrupt(() =>
						Effect.sync(function () {
							interrupted = true
						})
					)
				)
				try {
					const result = runtime.runPromise(RecordLoader.load(input), { signal: controller.signal })
					const rejected = expect(result).rejects.toBeDefined()
					yield* Deferred.await(started)
					controller.abort()
					yield* Effect.promise(() => rejected)
					expect(interrupted).toBe(true)
					expect(released).toBe(false)
					expect(
						(yield* Effect.promise(() =>
							runtime.runPromise(RecordLoader.load(Effect.flatMap(Reader, (reader) => reader.read)))
						)).key
					).toBe("a")
				} finally {
					yield* Effect.promise(() => runtime.dispose())
				}
				expect(released).toBe(true)
			})
		)
	})

	it.live("leaves runtime initialization failures at the host execution boundary", () =>
		Effect.gen(function* () {
			const runtime = ManagedRuntime.make(Layer.effect(Reader, Effect.fail("initialization failed")))
			try {
				yield* Effect.promise(() =>
					expect(
						runtime.runPromise(RecordLoader.load(Effect.flatMap(Reader, (reader) => reader.read)))
					).rejects.toThrow(/initialization failed/)
				)
			} finally {
				yield* Effect.promise(() => runtime.dispose())
			}
		})
	)
})

describe("Loader.settleQueryIf", function () {
	const query = Query.define({
		name: "ExternalRecord",
		data: Schema.Finite,
		error: Schema.String,
		execute: Effect.succeed(0),
	})
	const policy = { fresher: (incoming: number, current: number) => incoming > current }

	it("preserves decoded keyed arguments and unrelated entries while settling transformed outcomes", function () {
		const keyed = Query.define({
			name: "TransformedSettlement",
			args: { id: Schema.FiniteFromString, limit: Schema.optionalKey(Schema.FiniteFromString) },
			data: Schema.DateFromString,
			error: Schema.DateFromString,
			execute: () => Effect.succeed(data.at),
		})
		const policy = { fresher: (incoming: Date, current: Date) => incoming > current }
		const first = Loader.settleQueryIf(keyed, keyed.init(), { id: 1 }, AsyncData.Success({ data: data.at }), policy)
		const second = Loader.settleQueryIf(
			keyed,
			first.model,
			{ id: 2, limit: 5 },
			AsyncData.Success({ data: data.at }),
			policy
		)
		expect(keyed.read(second.model, { id: 1 })).toEqual(AsyncData.Success({ data: data.at }))
		const failed = Loader.settleQueryIf(
			keyed,
			second.model,
			{ id: 2, limit: 5 },
			AsyncData.Failure({ error: data.at }),
			{
				...policy,
				acceptFailure: () => true,
			}
		)
		expect(keyed.read(failed.model, { id: 2, limit: 5 })).toEqual(
			AsyncData.Stale({ data: data.at, error: data.at })
		)
		expect(keyed.read(failed.model, { id: 1 })).toEqual(AsyncData.Success({ data: data.at }))
		expect(failed.commands).toBeUndefined()
	})

	it("retains interruptible instance identity and returns cancellation Commands without fetching", function () {
		const keyed = Query.define({
			name: "InterruptibleSettlement",
			interrupt: true,
			args: { id: Schema.String },
			data: Schema.Finite,
			error: Schema.String,
			execute: () => Effect.succeed(0),
		})
		const args = { id: "a" }
		const pending = keyed.loadIfMissing(keyed.init("screen"), args)
		const settled = Loader.settleQueryIf(keyed, pending.model, args, AsyncData.Success({ data: 2 }), policy)
		expect(settled.model.instanceId).toBe("screen")
		expect(keyed.read(settled.model, args)).toEqual(AsyncData.Success({ data: 2 }))
		expect(settled.commands).toHaveLength(1)
		expect(settled.commands?.[0]?.name).toBe(keyed.Fetch.Interrupt.name)
		const stale = keyed.Message.CompletedFetch({
			args,
			instanceId: "screen",
			generation: pending.model.generation,
			result: Result.succeed(1),
		})
		expect(keyed.update(settled.model, stale).model).toBe(settled.model)

		const plain = Query.define({
			name: "InterruptiblePlainSettlement",
			interrupt: true,
			data: Schema.Finite,
			error: Schema.String,
			execute: Effect.succeed(0),
		})
		const loading = plain.loadIfMissing(plain.init("screen"))
		const loaded = Loader.settleQueryIf(plain, loading.model, AsyncData.Success({ data: 2 }), policy)
		expect(loaded.model.instanceId).toBe("screen")
		expect(plain.read(loaded.model)).toEqual(AsyncData.Success({ data: 2 }))
		expect(loaded.commands?.[0]?.name).toBe(plain.Fetch.Interrupt.name)
	})

	it("applies accepted plain Query outcomes without Fetch Commands and rejects earlier completions", function () {
		const pending = query.loadIfMissing(query.init())
		const settled = Loader.settleQueryIf(query, pending.model, AsyncData.Success({ data: 2 }), policy)
		expect(query.read(settled.model)).toEqual(AsyncData.Success({ data: 2 }))
		expect(settled.commands).toBeUndefined()
		const oldCompletion = query.Message.CompletedFetch({
			generation: pending.model.generation,
			result: Result.succeed(1),
		})
		expect(query.update(settled.model, oldCompletion).model).toBe(settled.model)
		expect(Loader.settleQueryIf(query, settled.model, AsyncData.Success({ data: 1 }), policy).model).toBe(
			settled.model
		)
		expect(Loader.settleQueryIf(query, settled.model, AsyncData.Loading(), policy).model).toBe(settled.model)
	})

	it("keeps cached data on rejected failure and retains it as Stale when a custom failure policy accepts", function () {
		const loaded = Loader.settleQueryIf(query, query.init(), AsyncData.Success({ data: 2 }), policy)
		const failure = AsyncData.Failure({ error: "offline" })
		expect(Loader.settleQueryIf(query, loaded.model, failure, policy).model).toBe(loaded.model)
		const accepted = Loader.settleQueryIf(query, loaded.model, failure, { ...policy, acceptFailure: () => true })
		expect(query.read(accepted.model)).toEqual(AsyncData.Stale({ data: 2, error: "offline" }))
		expect(accepted.commands).toBeUndefined()
		const empty = Loader.settleQueryIf(query, query.init(), failure, policy)
		expect(query.read(empty.model)).toEqual(failure)
		const pending = query.loadIfMissing(query.init())
		expect(Loader.settleQueryIf(query, pending.model, failure, policy).model).toBe(pending.model)
	})
})
