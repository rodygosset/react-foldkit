import { createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router"
import { Effect, Result, Schema } from "effect"
import { describe, it } from "@effect/vitest"
import { expect, vi } from "vitest"
import * as Loader from "./loader"
import * as TanStackSource from "./tanstack"

const Project = Loader.define({ name: "Project", data: Schema.String, key: (value) => value })
const Count = Loader.define({ name: "Count", data: Schema.Finite, key: () => "count" })

function routerWith(rootData: unknown, childData: unknown) {
	const root = createRootRoute({ loader: () => rootData })
	const child = createRoute({ getParentRoute: () => root, path: "/", loader: () => childData })
	return createRouter({ routeTree: root.addChildren([child]), history: createMemoryHistory() })
}

describe("TanStack CommitSource adapter", function () {
	it.live("composes heterogeneous declarations in match order and preserves transported receipts", () =>
		Effect.gen(function* () {
			const project = yield* Project.load(Effect.succeed("a"))
			const count = yield* Count.load(Effect.succeed(2))
			const Json = Schema.Unknown.pipe(Schema.fromJsonString)
			const roundTrip = Effect.fnUntraced(function* (value: unknown) {
				return yield* Schema.decodeEffect(Json)(yield* Schema.encodeEffect(Json)(value))
			})
			const router = routerWith(yield* roundTrip(count), yield* roundTrip(project))
			const source = Result.getOrThrow(
				TanStackSource.make(router, [
					Project.pipe(
						Loader.mapMessages((project, receipt) => ({ _tag: "Project" as const, project, receipt }))
					),
					Count.pipe(Loader.mapMessages((count, receipt) => ({ _tag: "Count" as const, count, receipt }))),
				])
			)
			yield* Effect.promise(() => router.load())
			const first = Result.getOrThrow(source.getSnapshot())
			expect(first.map(({ message }) => message)).toEqual([
				{ _tag: "Count", count: 2, receipt: { name: "Count", key: "count", version: count.version } },
				{ _tag: "Project", project: "a", receipt: { name: "Project", key: "a", version: project.version } },
			])
			const second = Result.getOrThrow(source.getSnapshot())
			expect(second.map(({ version }) => version)).toEqual([count.version, project.version])
		})
	)

	it.live("reuses an unchanged matches snapshot and observes new matches after loading", () =>
		Effect.gen(function* () {
			const envelope = yield* Project.load(Effect.succeed("a"))
			const router = routerWith(null, envelope)
			const mapping = vi.fn((value: string) => value)
			const source = Result.getOrThrow(TanStackSource.make(router, [Project.pipe(Loader.mapMessages(mapping))]))
			const initial = source.getSnapshot()
			expect(Result.getOrThrow(initial)).toEqual([])
			expect(source.getSnapshot()).toBe(initial)
			expect(mapping).not.toHaveBeenCalled()
			yield* Effect.promise(() => router.load())
			const loaded = source.getSnapshot()
			expect(loaded).not.toBe(initial)
			expect(Result.getOrThrow(loaded).map(({ message }) => message)).toEqual(["a"])
			expect(source.getSnapshot()).toBe(loaded)
			expect(mapping).toHaveBeenCalledTimes(1)
		})
	)

	it.live("gives shared resources distinct delivery keys for different matches", () =>
		Effect.gen(function* () {
			const envelope = yield* Project.load(Effect.succeed("a"))
			const router = routerWith(envelope, envelope)
			yield* Effect.promise(() => router.load())
			const entries = Result.getOrThrow(TanStackSource.make(router, [Project])).getSnapshot()
			expect(Result.isFailure(entries)).toBe(false)
			if (Result.isSuccess(entries)) {
				expect(entries.success).toHaveLength(2)
				expect(new Set(entries.success.map((entry) => entry.key)).size).toBe(2)
				expect(entries.success.map((entry) => entry.version)).toEqual([envelope.version, envelope.version])
			}
		})
	)

	it("rejects duplicate declarations before subscribing", function () {
		const router = routerWith(null, null)
		const subscribe = vi.spyOn(router.stores.matches, "subscribe")
		expect(TanStackSource.make(router, [Project, Project])).toEqual(
			Result.fail(new TanStackSource.RegistryError({ declarationName: "Project" }))
		)
		expect(subscribe).not.toHaveBeenCalled()
	})

	it.live("ignores unrelated and unregistered data but reports malformed registered envelopes", () =>
		Effect.gen(function* () {
			const envelope = yield* Project.load(Effect.succeed("a"))
			const ignored = routerWith({ arbitrary: "data" }, { ...envelope, name: "Unregistered", payload: null })
			yield* Effect.promise(() => ignored.load())
			expect(Result.getOrThrow(Result.getOrThrow(TanStackSource.make(ignored, [Project])).getSnapshot())).toEqual(
				[]
			)
			for (const invalid of [
				{ ...envelope, payload: 42 },
				{ ...envelope, format: 0 },
				{ ...envelope, version: {} },
			]) {
				const router = routerWith(null, invalid)
				yield* Effect.promise(() => router.load())
				const snapshot = Result.getOrThrow(TanStackSource.make(router, [Project])).getSnapshot()
				expect(Result.isFailure(snapshot)).toBe(true)
				if (Result.isFailure(snapshot)) expect(snapshot.failure).toBeInstanceOf(Schema.SchemaError)
			}
		})
	)

	it.live("subscribes once, exposes the published snapshot inside notifications, and releases it", () =>
		Effect.gen(function* () {
			const testServices = yield* Effect.context<never>()
			let revision = 0
			const root = createRootRoute()
			const child = createRoute({
				getParentRoute: () => root,
				path: "/",
				loader: () => Effect.runPromiseWith(testServices)(Count.load(Effect.sync(() => ++revision))),
			})
			const router = createRouter({ routeTree: root.addChildren([child]), history: createMemoryHistory() })
			yield* Effect.promise(() => router.load())
			const source = Result.getOrThrow(TanStackSource.make(router, [Count]))
			const subscribe = vi.spyOn(router.stores.matches, "subscribe")
			const observed: number[] = []
			const stop = source.subscribe(function () {
				const snapshot = source.getSnapshot()
				if (Result.isSuccess(snapshot))
					observed.push(...snapshot.success.map((entry) => entry.message as number))
			})
			expect(subscribe).toHaveBeenCalledTimes(1)
			yield* Effect.promise(() => router.invalidate())
			expect(observed).toContain(2)
			stop()
			const notifications = observed.length
			yield* Effect.promise(() => router.invalidate())
			expect(observed).toHaveLength(notifications)
		})
	)
})
