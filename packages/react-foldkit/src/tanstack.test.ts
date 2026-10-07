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
	it("composes heterogeneous declarations in match order and preserves transported receipts", async function () {
		const project = await Effect.runPromise(Project.load(Effect.succeed("a")))
		const count = await Effect.runPromise(Count.load(Effect.succeed(2)))
		const Json = Schema.Unknown.pipe(Schema.fromJsonString)
		const roundTrip = (value: unknown) => Schema.decodeSync(Json)(Schema.encodeSync(Json)(value))
		const router = routerWith(roundTrip(count), roundTrip(project))
		const source = Result.getOrThrow(
			TanStackSource.make(router, [
				Project.pipe(
					Loader.mapMessages((project, receipt) => ({ _tag: "Project" as const, project, receipt }))
				),
				Count.pipe(Loader.mapMessages((count, receipt) => ({ _tag: "Count" as const, count, receipt }))),
			])
		)
		await router.load()
		const first = Result.getOrThrow(source.getSnapshot())
		expect(first.map(({ message }) => message)).toEqual([
			{ _tag: "Count", count: 2, receipt: { name: "Count", key: "count", version: count.version } },
			{ _tag: "Project", project: "a", receipt: { name: "Project", key: "a", version: project.version } },
		])
		const second = Result.getOrThrow(source.getSnapshot())
		expect(second.map(({ version }) => version)).toEqual([count.version, project.version])
	})

	it("reuses an unchanged matches snapshot and observes new matches after loading", async function () {
		const envelope = await Effect.runPromise(Project.load(Effect.succeed("a")))
		const router = routerWith(null, envelope)
		const mapping = vi.fn((value: string) => value)
		const source = Result.getOrThrow(TanStackSource.make(router, [Project.pipe(Loader.mapMessages(mapping))]))
		const initial = source.getSnapshot()
		expect(Result.getOrThrow(initial)).toEqual([])
		expect(source.getSnapshot()).toBe(initial)
		expect(mapping).not.toHaveBeenCalled()
		await router.load()
		const loaded = source.getSnapshot()
		expect(loaded).not.toBe(initial)
		expect(Result.getOrThrow(loaded).map(({ message }) => message)).toEqual(["a"])
		expect(source.getSnapshot()).toBe(loaded)
		expect(mapping).toHaveBeenCalledTimes(1)
	})

	it("gives shared resources distinct delivery keys for different matches", async function () {
		const envelope = await Effect.runPromise(Project.load(Effect.succeed("a")))
		const router = routerWith(envelope, envelope)
		await router.load()
		const entries = Result.getOrThrow(TanStackSource.make(router, [Project])).getSnapshot()
		expect(Result.isFailure(entries)).toBe(false)
		if (Result.isSuccess(entries)) {
			expect(entries.success).toHaveLength(2)
			expect(new Set(entries.success.map((entry) => entry.key)).size).toBe(2)
			expect(entries.success.map((entry) => entry.version)).toEqual([envelope.version, envelope.version])
		}
	})

	it("rejects duplicate declarations before subscribing", function () {
		const router = routerWith(null, null)
		const subscribe = vi.spyOn(router.stores.matches, "subscribe")
		expect(TanStackSource.make(router, [Project, Project])).toEqual(
			Result.fail(new TanStackSource.RegistryError({ declarationName: "Project" }))
		)
		expect(subscribe).not.toHaveBeenCalled()
	})

	it("ignores unrelated and unregistered data but reports malformed registered envelopes", async function () {
		const envelope = await Effect.runPromise(Project.load(Effect.succeed("a")))
		const ignored = routerWith({ arbitrary: "data" }, { ...envelope, name: "Unregistered", payload: null })
		await ignored.load()
		expect(Result.getOrThrow(Result.getOrThrow(TanStackSource.make(ignored, [Project])).getSnapshot())).toEqual([])
		for (const invalid of [
			{ ...envelope, payload: 42 },
			{ ...envelope, format: 0 },
			{ ...envelope, version: {} },
		]) {
			const router = routerWith(null, invalid)
			await router.load()
			const snapshot = Result.getOrThrow(TanStackSource.make(router, [Project])).getSnapshot()
			expect(Result.isFailure(snapshot)).toBe(true)
			if (Result.isFailure(snapshot)) expect(snapshot.failure).toBeInstanceOf(Schema.SchemaError)
		}
	})

	it("subscribes once, exposes the published snapshot inside notifications, and releases it", async function () {
		let revision = 0
		const root = createRootRoute()
		const child = createRoute({
			getParentRoute: () => root,
			path: "/",
			loader: () => Effect.runPromise(Count.load(Effect.sync(() => ++revision))),
		})
		const router = createRouter({ routeTree: root.addChildren([child]), history: createMemoryHistory() })
		await router.load()
		const source = Result.getOrThrow(TanStackSource.make(router, [Count]))
		const subscribe = vi.spyOn(router.stores.matches, "subscribe")
		const observed: number[] = []
		const stop = source.subscribe(function () {
			const snapshot = source.getSnapshot()
			if (Result.isSuccess(snapshot)) observed.push(...snapshot.success.map((entry) => entry.message as number))
		})
		expect(subscribe).toHaveBeenCalledTimes(1)
		await router.invalidate()
		expect(observed).toContain(2)
		stop()
		const notifications = observed.length
		await router.invalidate()
		expect(observed).toHaveLength(notifications)
	})
})
