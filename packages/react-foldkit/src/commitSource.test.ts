// @vitest-environment node

import { Context, Deferred, Effect, Layer, ManagedRuntime, Result, Schema } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"
import * as CommitSource from "./commitSource"

const Data = Schema.Struct({ id: Schema.String, at: Schema.DateFromString })
type Data = typeof Data.Type
const data: Data = { id: "a", at: new Date("2026-10-01T12:00:00Z") }
const Loader = CommitSource.define({ name: "Record", data: Data, key: ({ id }) => id })

afterEach(() => vi.restoreAllMocks())

describe("CommitSource declarations", () => {
	it("loads lazily, encodes native Schema values, and allocates one token per execution", () => {
		const tokens = vi.spyOn(crypto, "randomUUID")
		const input = vi.fn(() => data)
		const program = Loader.load(Effect.sync(input))
		expect(input).not.toHaveBeenCalled()
		expect(tokens).not.toHaveBeenCalled()
		const first = Effect.runSync(program)
		const second = Effect.runSync(program)
		expect(first.payload).toEqual({ id: "a", at: data.at.toISOString() })
		expect(first.version).not.toBe(second.version)
		expect(input).toHaveBeenCalledTimes(2)
		expect(tokens).toHaveBeenCalledTimes(2)
		expect(Loader.decode(first)).toEqual(data)
		expect(Loader.decode(JSON.parse(JSON.stringify(first)))).toEqual(data)
		expect(tokens).toHaveBeenCalledTimes(2)
	})

	it("composes local and root mapping with unchanged receipt and loading identity", () => {
		const local = CommitSource.define({
			name: "Record",
			data: Data,
			key: ({ id }) => id,
			toMessage: (data, receipt) => ({ _tag: "Loaded" as const, data, receipt }),
		})
		const root = local.pipe(
			CommitSource.mapMessages((message, receipt) => ({ message, receipt })),
			CommitSource.mapMessages((message, receipt) => ({ _tag: "Root" as const, ...message, latest: receipt }))
		)
		const envelope = Effect.runSync(root.load(Effect.succeed(data)))
		const message = root.decode(envelope)
		expect(root.load).toBe(local.load)
		expect(root.data).toBe(local.data)
		expect(message.receipt).toEqual({ name: "Record", key: "a", version: envelope.version })
		expect(message.latest).toBe(message.receipt)
		expect(message.message.receipt).toBe(message.receipt)
		expect(Schema.decodeUnknownSync(CommitSource.Receipt)(message.receipt)).toEqual(message.receipt)
	})

	it("preserves input failures and encoding failures without allocating tokens", () => {
		const tokens = vi.spyOn(crypto, "randomUUID")
		expect(Effect.runSync(Effect.result(Loader.load(Effect.fail("unavailable"))))).toEqual(
			Result.fail("unavailable")
		)
		const invalid = Loader.load(Effect.succeed({ ...data, at: new Date(NaN) }))
		const result = Effect.runSync(Effect.result(invalid))
		expect(result._tag).toBe("Failure")
		if (result._tag === "Failure") expect(Schema.isSchemaError(result.failure)).toBe(true)
		expect(tokens).not.toHaveBeenCalled()
	})

	it("rejects resource keys that do not match the decoded payload", () => {
		const envelope = Effect.runSync(Loader.load(Effect.succeed(data)))
		expect(() => Loader.decode({ ...envelope, key: "another-resource" })).toThrow(/resource key/)
	})
})

class Reader extends Context.Service<Reader, { readonly read: Effect.Effect<Data> }>()("CommitSourceTest/Reader") {}

describe("host-owned Effect execution", () => {
	it("acquires services lazily, reuses them within a runtime, and isolates requests", async () => {
		let acquired = 0
		let released = 0
		const runtime = (id: string) =>
			ManagedRuntime.make(
				Layer.effect(
					Reader,
					Effect.acquireRelease(
						Effect.sync(() => {
							acquired += 1
							return { read: Effect.succeed({ ...data, id }) }
						}),
						() =>
							Effect.sync(() => {
								released += 1
							})
					)
				)
			)
		const first = runtime("first")
		const second = runtime("second")
		const program = Loader.load(Effect.flatMap(Reader, (reader) => reader.read))
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
				Effect.acquireRelease(Effect.succeed({ read: Effect.succeed(data) }), () =>
					Effect.sync(() => {
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
				Effect.sync(() => {
					interrupted = true
				})
			)
		)
		const controller = new AbortController()
		try {
			const result = runtime.runPromise(Loader.load(input), { signal: controller.signal })
			const rejected = expect(result).rejects.toBeDefined()
			await Effect.runPromise(Deferred.await(started))
			controller.abort()
			await rejected
			expect(interrupted).toBe(true)
			expect(released).toBe(false)
			expect((await runtime.runPromise(Loader.load(Effect.flatMap(Reader, (reader) => reader.read)))).key).toBe(
				"a"
			)
		} finally {
			await runtime.dispose()
		}
		expect(released).toBe(true)
	})

	it("leaves runtime initialization failures at the host execution boundary", async () => {
		const runtime = ManagedRuntime.make(Layer.effect(Reader, Effect.fail("initialization failed")))
		try {
			await expect(
				runtime.runPromise(Loader.load(Effect.flatMap(Reader, (reader) => reader.read)))
			).rejects.toThrow(/initialization failed/)
		} finally {
			await runtime.dispose()
		}
	})
})
