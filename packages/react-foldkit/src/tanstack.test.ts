import { createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router"
import { Effect, Schema } from "effect"
import { describe, expect, it, vi } from "vitest"
import * as CommitSource from "./commitSource"
import * as TanStackSource from "./tanstack"

const Project = CommitSource.define({ name: "Project", data: Schema.String, key: (value) => value })
const Count = CommitSource.define({ name: "Count", data: Schema.Number, key: () => "count" })

function routerWith(rootData: unknown, childData: unknown) {
	const root = createRootRoute({ loader: () => rootData })
	const child = createRoute({ getParentRoute: () => root, path: "/", loader: () => childData })
	return createRouter({ routeTree: root.addChildren([child]), history: createMemoryHistory() })
}

describe("TanStack CommitSource adapter", () => {
	it("composes heterogeneous declarations in match order and preserves transported receipts", async () => {
		const project = Effect.runSync(Project.load(Effect.succeed("a")))
		const count = Effect.runSync(Count.load(Effect.succeed(2)))
		const router = routerWith(JSON.parse(JSON.stringify(count)), JSON.parse(JSON.stringify(project)))
		const source = TanStackSource.make(router, [
			Project.pipe(
				CommitSource.mapMessages((project, receipt) => ({ _tag: "Project" as const, project, receipt }))
			),
			Count.pipe(CommitSource.mapMessages((count, receipt) => ({ _tag: "Count" as const, count, receipt }))),
		])
		await router.load()
		expect(source.getSnapshot().map(({ message }) => message)).toEqual([
			{ _tag: "Count", count: 2, receipt: { name: "Count", key: "count", version: count.version } },
			{ _tag: "Project", project: "a", receipt: { name: "Project", key: "a", version: project.version } },
		])
		expect(source.getSnapshot().map(({ version }) => version)).toEqual([count.version, project.version])
	})

	it("gives shared resources distinct delivery keys for different matches", async () => {
		const envelope = Effect.runSync(Project.load(Effect.succeed("a")))
		const router = routerWith(envelope, envelope)
		await router.load()
		const entries = TanStackSource.make(router, [Project]).getSnapshot()
		expect(entries).toHaveLength(2)
		expect(new Set(entries.map((entry) => entry.key)).size).toBe(2)
		expect(entries.map((entry) => entry.version)).toEqual([envelope.version, envelope.version])
	})

	it("rejects duplicate declarations before subscribing", () => {
		const router = routerWith(null, null)
		const subscribe = vi.spyOn(router.stores.matches, "subscribe")
		expect(() => TanStackSource.make(router, [Project, Project])).toThrow(TanStackSource.RegistryError)
		expect(subscribe).not.toHaveBeenCalled()
	})

	it("ignores unrelated and unregistered data but rejects malformed registered envelopes", async () => {
		const envelope = Effect.runSync(Project.load(Effect.succeed("a")))
		const ignored = routerWith({ arbitrary: "data" }, { ...envelope, name: "Unregistered", payload: null })
		await ignored.load()
		expect(TanStackSource.make(ignored, [Project]).getSnapshot()).toEqual([])
		for (const invalid of [
			{ ...envelope, payload: 42 },
			{ ...envelope, format: 0 },
			{ ...envelope, version: {} },
		]) {
			const router = routerWith(null, invalid)
			await router.load()
			expect(() => TanStackSource.make(router, [Project]).getSnapshot()).toThrow(Schema.SchemaError)
		}
	})

	it("subscribes once, exposes the published snapshot inside notifications, and releases it", async () => {
		let revision = 0
		const root = createRootRoute()
		const child = createRoute({
			getParentRoute: () => root,
			path: "/",
			loader: () => Effect.runPromise(Count.load(Effect.sync(() => ++revision))),
		})
		const router = createRouter({ routeTree: root.addChildren([child]), history: createMemoryHistory() })
		await router.load()
		const source = TanStackSource.make(router, [Count])
		const subscribe = vi.spyOn(router.stores.matches, "subscribe")
		const observed: number[] = []
		const stop = source.subscribe(() => {
			observed.push(...source.getSnapshot().map((entry) => entry.message))
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
