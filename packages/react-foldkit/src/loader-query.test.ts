// @vitest-environment node

import { assert, describe, it } from "@effect/vitest"
import { Effect, Exit, Result, Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import * as Query from "foldkit/experimental/query"
import { afterEach, vi } from "vitest"
import * as AsyncData from "./asyncData"
import * as Loader from "./loader"

const at = Schema.decodeSync(Schema.DateFromString)("2026-10-01T12:00:00.000Z")
afterEach(() => vi.restoreAllMocks())

describe("derived Query Loaders", function () {
	it.effect("defaults plain identity and reuses the Model's transformed outcome codec", () =>
		Effect.gen(function* () {
			const query = Query.define({
				name: "Date",
				data: Schema.DateFromString,
				error: Schema.String,
				execute: Effect.succeed(at),
			})
			const loader = Loader.fromQuery(query)
			const envelope = yield* loader.loadQuery
			assert.strictEqual(loader.query, query)
			assert.strictEqual(loader.Load.fields.result, query.Model.fields.data)
			assert.strictEqual(envelope.name, "FetchDate")
			assert.strictEqual(envelope.key, "singleton")
			assert.deepStrictEqual(envelope.payload, { result: { _tag: "Success", data: at.toISOString() } })
			assert.deepStrictEqual(Result.getOrThrow(loader.decode(envelope)), {
				result: AsyncData.Success({ data: at }),
			})
		})
	)

	it.effect("preserves transformed args, data, and errors without repeating schemas", () =>
		Effect.gen(function* () {
			const query = Query.define({
				name: "Transformed",
				args: { id: Schema.FiniteFromString },
				data: Schema.DateFromString,
				error: Schema.DateFromString,
				execute: ({ id }) => (id === 1 ? Effect.succeed(at) : Effect.fail(at)),
			})
			const loader = Loader.fromQuery(query)
			const Entry = query.Model.fields.entries.value
			assert.strictEqual(loader.Load.fields.args, Entry.fields.args)
			assert.strictEqual(loader.Load.fields.result, Entry.fields.data)
			const success = yield* loader.loadQuery({ id: 1 })
			const failure = yield* loader.loadQuery({ id: 2 })
			assert.strictEqual(success.key, '{"id":"1"}')
			assert.deepStrictEqual(success.payload, {
				args: { id: "1" },
				result: { _tag: "Success", data: at.toISOString() },
			})
			assert.deepStrictEqual(failure.payload, {
				args: { id: "2" },
				result: { _tag: "Failure", error: at.toISOString() },
			})
			assert.deepStrictEqual(Result.getOrThrow(loader.decode(success)), {
				args: { id: 1 },
				result: AsyncData.Success({ data: at }),
			})
			assert.deepStrictEqual(Result.getOrThrow(loader.decode(failure)), {
				args: { id: 2 },
				result: AsyncData.Failure({ error: at }),
			})
		})
	)

	it.effect("canonicalizes nested object keys, preserves array order, and ignores outcomes", () =>
		Effect.gen(function* () {
			const query = Query.define({
				name: "Json",
				args: { options: Schema.Json },
				data: Schema.String,
				error: Schema.String,
				execute: () => Effect.succeed("ok"),
			})
			const loader = Loader.fromQuery(query)
			const first = yield* loader.loadQuery({ options: { z: [{ b: 2, a: 1 }], a: [1, 2] } })
			const second = yield* loader.loadQuery({ options: { a: [1, 2], z: [{ a: 1, b: 2 }] } })
			const reordered = yield* loader.loadQuery({ options: { a: [2, 1], z: [{ a: 1, b: 2 }] } })
			const failure = yield* loader.load(
				Effect.succeed({
					args: { options: { a: [1, 2], z: [{ a: 1, b: 2 }] } },
					result: AsyncData.Failure({ error: "offline" }),
				})
			)
			assert.strictEqual(first.key, second.key)
			assert.strictEqual(first.key, failure.key)
			assert.notStrictEqual(first.key, reordered.key)
			assert.isTrue(Result.isFailure(loader.decode({ ...first, key: reordered.key })))
		})
	)

	it.effect("loads interruptible Queries lazily and keeps delivery identity separate from cache keys", () =>
		Effect.gen(function* () {
			const execute = vi.fn(() => Effect.succeed("ok"))
			const query = Query.define({
				name: "Interruptible",
				interrupt: true,
				args: { id: Schema.String },
				toKey: () => "shared-cache-slot",
				data: Schema.String,
				error: Schema.String,
				execute,
			})
			execute.mockClear()
			const loader = Loader.fromQuery(query)
			assert.strictEqual(execute.mock.calls.length, 0)
			assert.strictEqual(loader.query, query)
			const envelope = yield* loader.loadQuery({ id: "a" })
			assert.strictEqual(envelope.name, query.Fetch.name)
			assert.strictEqual(envelope.key, '{"id":"a"}')
			assert.deepStrictEqual(Result.getOrThrow(loader.decode(envelope)), {
				args: { id: "a" },
				result: AsyncData.Success({ data: "ok" }),
			})
			const plain = Query.define({
				name: "InterruptiblePlain",
				interrupt: true,
				data: Schema.String,
				error: Schema.String,
				execute: Effect.succeed("ok"),
			})
			const plainLoader = Loader.fromQuery(plain)
			assert.strictEqual((yield* plainLoader.loadQuery).key, "singleton")
		})
	)

	it.effect("allows independent name and key overrides", () =>
		Effect.gen(function* () {
			const query = Query.define({
				name: "Override",
				args: { id: Schema.String },
				data: Schema.String,
				error: Schema.String,
				execute: () => Effect.succeed("ok"),
			})
			const named = Loader.fromQuery(query, { name: "RouteProject" })
			const key = vi.fn(({ id }: { id: string }) => id)
			const keyed = Loader.fromQuery(query, { key })
			const first = yield* named.loadQuery({ id: "a" })
			const second = yield* keyed.loadQuery({ id: "a" })
			assert.strictEqual(first.name, "RouteProject")
			assert.strictEqual(first.key, '{"id":"a"}')
			assert.strictEqual(second.name, "FetchOverride")
			assert.strictEqual(second.key, "a")
			assert.deepStrictEqual(key.mock.calls[0]?.[0], { id: "a" })
			assert.deepStrictEqual(Result.getOrThrow(keyed.decode(second)), {
				args: { id: "a" },
				result: AsyncData.Success({ data: "ok" }),
			})
		})
	)

	it.effect("keeps key encoding failures typed and allocates no delivery token", () =>
		Effect.gen(function* () {
			const tokens = vi.spyOn(crypto, "randomUUID")
			const query = Query.define({
				name: "Unknown",
				args: { value: Schema.Unknown },
				data: Schema.String,
				error: Schema.String,
				execute: () => Effect.succeed("ok"),
			})
			const loader = Loader.fromQuery(query)
			const result = yield* Effect.result(loader.loadQuery({ value: () => undefined }))
			assert.strictEqual(result._tag, "Failure")
			if (result._tag === "Failure") assert.isTrue(Schema.isSchemaError(result.failure))
			assert.strictEqual(tokens.mock.calls.length, 0)
		})
	)

	it.effect("preserves programmer defects from custom key functions", () =>
		Effect.gen(function* () {
			const defect = new Error("broken key")
			const query = Query.define({
				name: "Defect",
				args: { id: Schema.String },
				data: Schema.String,
				error: Schema.String,
				execute: () => Effect.succeed("ok"),
			})
			const loader = Loader.fromQuery(query, {
				key() {
					throw defect
				},
			})
			assert.deepStrictEqual(yield* Effect.exit(loader.loadQuery({ id: "a" })), Exit.die(defect))
		})
	)

	it.effect("round-trips arguments named result and args without collisions", () =>
		Effect.gen(function* () {
			const query = Query.define({
				name: "UnrestrictedArgs",
				args: { result: Schema.FiniteFromString, args: Schema.String },
				data: Schema.String,
				error: Schema.String,
				execute: ({ args, result }) => Effect.succeed(`${args}/${result}`),
			})
			const loader = Loader.fromQuery(query)
			const args = { result: 1, args: "nested" }
			const envelope = yield* loader.loadQuery(args)
			assert.deepStrictEqual(envelope.payload, {
				args: { result: "1", args: "nested" },
				result: { _tag: "Success", data: "nested/1" },
			})
			assert.deepStrictEqual(Result.getOrThrow(loader.decode(envelope)), {
				args,
				result: AsyncData.Success({ data: "nested/1" }),
			})
			const overridden = Loader.fromQuery(query, { key: ({ result }) => String(result) })
			assert.strictEqual((yield* overridden.loadQuery(args)).key, "1")
			const settled = Loader.settleQueryIf(query, query.init(), args, AsyncData.Success({ data: "nested/1" }), {
				fresher: () => true,
			})
			assert.deepStrictEqual(query.read(settled.model, args), AsyncData.Success({ data: "nested/1" }))
		})
	)

	it.effect("derives HttpApi request, success, and declared error codecs", () =>
		Effect.gen(function* () {
			const ApiError = Schema.Struct({ _tag: Schema.tag("Unavailable"), at: Schema.DateFromString })
			const Api = HttpApi.make("LoaderApi").add(
				HttpApiGroup.make("projects").add(
					HttpApiEndpoint.get("get", "/projects/:id", {
						params: { id: Schema.String },
						success: Schema.DateFromString,
						error: ApiError,
					})
				)
			)
			class Client extends Query.HttpApi.Service<Client>()("LoaderApiClient", { api: Api }) {}
			const query = Client.query("Project", "projects", "get")
			const loader = Loader.fromQuery(query)
			const success = yield* loader.load(
				Effect.succeed({ args: { params: { id: "a" } }, result: AsyncData.Success({ data: at }) })
			)
			const failure = yield* loader.load(
				Effect.succeed({
					args: { params: { id: "a" } },
					result: AsyncData.Failure({ error: ApiError.make({ at }) }),
				})
			)
			assert.strictEqual(success.key, '{"params":{"id":"a"}}')
			assert.strictEqual(failure.key, success.key)
			assert.deepStrictEqual(success.payload.result, { _tag: "Success", data: at.toISOString() })
			assert.deepStrictEqual(Result.getOrThrow(loader.decode(failure)), {
				args: { params: { id: "a" } },
				result: AsyncData.Failure({ error: ApiError.make({ at }) }),
			})
		})
	)
})
