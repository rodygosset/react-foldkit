import { RouterProvider } from "@tanstack/react-router"
import { act, cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Deferred, Effect } from "effect"
import * as AsyncData from "../../src/asyncData"
import { controlledDrains } from "../fixtures/controlled-drains"
import { createFixture, response, type SearchResponse } from "../fixtures/route-loader"

afterEach(function () {
	cleanup()
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
})

async function mount(fixture: ReturnType<typeof createFixture>) {
	await fixture.router.load()
	render(<RouterProvider router={fixture.router} />)
	await waitFor(() => expect(fixture.layoutMounts).toBe(1))
}

describe("TanStack route loader handoff", function () {
	it.each(["navigation", "revalidation"] as const)(
		"%s publishes loader data before its first render despite queued edits",
		async function (operation) {
			const drains = controlledDrains()
			vi.stubGlobal("MessageChannel", drains.Channel)
			let clock = 0
			vi.spyOn(performance, "now").mockImplementation(() => clock)
			let revision = 0
			let pressured = false
			const expectedRevision = operation === "revalidation" ? 2 : 1
			const fixture = createFixture({
				initial: operation === "revalidation" ? "/search/a" : "/",
				load: (query) => Effect.sync(() => response(query, ++revision)),
				onBurn() {
					clock += 10
				},
				onPublish(snapshot) {
					if (
						pressured ||
						!snapshot.some(
							({ message }) =>
								message._tag === "CompletedLoadSearch" &&
								AsyncData.isSuccess(message.load.result) &&
								message.load.result.data.revision === expectedRevision
						)
					)
						return
					pressured = true
					// Exhaust dispatch's budget so the edit stays queued until source commit drains it.
					fixture.burn()
					fixture.edit()
					expect(fixture.updates.at(-1)?._tag).toBe("BurnedBudget")
					expect(drains.pending).toBeGreaterThan(0)
				},
			})
			await mount(fixture)
			const before = fixture.renders.length
			await act(async function () {
				if (operation === "revalidation") await fixture.router.invalidate()
				else await fixture.router.navigate({ to: "/search/$query", params: { query: "a" } })
			})
			const first = fixture.renders
				.slice(before)
				.find(({ loaderRevision }) => loaderRevision === expectedRevision)
			expect(pressured).toBe(true)
			expect(first).toMatchObject({
				routeQuery: "a",
				modelQuery: "a",
				result: AsyncData.Success({ data: response("a", expectedRevision) }),
				model: { edits: 1 },
			})
			expect(fixture.liveRouteDeliveries).toHaveLength(1)
			act(() => drains.flush())
			expect(fixture.renders.at(-1)!.model.edits).toBe(1)
			expect(fixture.layoutMounts).toBe(1)
		}
	)

	it("preloading leaves the Model unchanged and cached entry does not refetch", async function () {
		const fixture = createFixture()
		await mount(fixture)
		await act(async function () {
			await fixture.router.preloadRoute({ to: "/search/$query", params: { query: "a" } })
		})
		expect(fixture.loaderCalls).toEqual(["a"])
		expect(fixture.liveRouteDeliveries).toEqual([])
		expect(fixture.layoutModels.at(-1)!.search.activeQuery).toBe("")
		await act(async function () {
			await fixture.router.navigate({ to: "/search/$query", params: { query: "a" } })
		})
		expect(fixture.loaderCalls).toEqual(["a"])
		expect(fixture.renders[0]).toMatchObject({
			modelQuery: "a",
			result: AsyncData.Success({ data: response("a") }),
		})
	})

	it("interrupts a superseded loader without installing data for the canceled destination", async function () {
		const slow = Deferred.makeUnsafe<SearchResponse>()
		let interruptions = 0
		const pending = Deferred.await(slow).pipe(
			Effect.onInterrupt(() =>
				Effect.sync(function () {
					interruptions += 1
				})
			)
		)
		const fixture = createFixture({
			load: (query) => (query === "slow" ? pending : Effect.succeed(response(query))),
		})
		await mount(fixture)
		let canceled!: Promise<void>
		act(function () {
			canceled = fixture.router.navigate({ to: "/search/$query", params: { query: "slow" } })
		})
		await waitFor(() => expect(fixture.loaderCalls).toContain("slow"))
		await act(async function () {
			await fixture.router.navigate({ to: "/search/$query", params: { query: "fast" } })
		})
		await waitFor(() => expect(interruptions).toBe(1))
		await act(async function () {
			Effect.runSync(Deferred.succeed(slow, response("slow")))
			await canceled
		})
		expect(fixture.renders.find(({ routeQuery }) => routeQuery === "fast")!.modelQuery).toBe("fast")
		expect(fixture.layoutModels.at(-1)!.search.activeQuery).toBe("fast")
		expect(fixture.liveRouteDeliveries).toHaveLength(1)
	})

	it("cached return installs the corresponding result on first render and preserves app edits", async function () {
		const fixture = createFixture({ initial: "/search/a" })
		await mount(fixture)
		act(() => fixture.edit())
		await act(async function () {
			await fixture.router.navigate({ to: "/search/$query", params: { query: "b" } })
		})
		const before = fixture.renders.length
		await act(async function () {
			await fixture.router.navigate({ to: "/search/$query", params: { query: "a" } })
		})
		const firstReturn = fixture.renders.slice(before).find(({ routeQuery }) => routeQuery === "a")!
		expect(firstReturn).toMatchObject({
			modelQuery: "a",
			result: AsyncData.Success({ data: response("a") }),
			model: { edits: 1 },
		})
		expect(fixture.loaderCalls).toEqual(["a", "b"])
		expect(fixture.layoutMounts).toBe(1)
		expect(fixture.fetchCalls).toEqual([])
	})

	it("a settled loader failure is visible on the destination's first render", async function () {
		const fixture = createFixture({ load: () => Effect.fail("unavailable") })
		await mount(fixture)
		await act(async function () {
			await fixture.router.navigate({ to: "/search/$query", params: { query: "a" } })
		})
		expect(fixture.renders[0]!.result).toEqual(AsyncData.Failure({ error: "unavailable" }))
	})
	it("a published loader outcome cancels an older Query Fetch while keeping app edits", async function () {
		const pending = Deferred.makeUnsafe<SearchResponse>()
		let interruptions = 0
		let revision = 0
		const fixture = createFixture({
			initial: "/search/a",
			load: (query) => Effect.sync(() => response(query, ++revision)),
			fetch: () =>
				Deferred.await(pending).pipe(
					Effect.onInterrupt(() =>
						Effect.sync(function () {
							interruptions += 1
						})
					)
				),
		})
		await mount(fixture)
		act(function () {
			fixture.refresh("a")
			fixture.edit()
		})
		await waitFor(() => expect(fixture.fetchCalls).toEqual(["a"]))
		await act(async function () {
			await fixture.router.invalidate()
		})
		const first = fixture.renders.find(({ loaderRevision }) => loaderRevision === 2)!
		expect(first.result).toEqual(AsyncData.Success({ data: response("a", 2) }))
		expect(first.model.edits).toBe(1)
		await waitFor(() => expect(interruptions).toBe(1))
		await waitFor(() =>
			expect(
				fixture.updates.some(
					(message) => message._tag === "GotSearchMessage" && message.message._tag === "GotQueryMessage"
				)
			).toBe(true)
		)
		await act(async function () {
			Effect.runSync(Deferred.succeed(pending, response("a", 99)))
		})
		expect(fixture.renders.at(-1)!.result).toEqual(AsyncData.Success({ data: response("a", 2) }))
		expect(fixture.loaderCalls).toEqual(["a", "a"])
		expect(fixture.liveRouteDeliveries).toHaveLength(1)
	})

	it("an unversioned loader failure leaves cached Query data unchanged", async function () {
		let succeed = true
		const fixture = createFixture({
			initial: "/search/a",
			load: (query) => (succeed ? Effect.succeed(response(query)) : Effect.fail("unavailable")),
		})
		await mount(fixture)
		const before = fixture.renders.length
		succeed = false
		await act(async function () {
			await fixture.router.invalidate()
		})
		expect(fixture.renders.slice(before)[0]!.result).toEqual(AsyncData.Success({ data: response("a") }))
		expect(fixture.fetchCalls).toEqual([])
	})

	it("cached loader re-entry cannot overwrite a newer Query refresh", async function () {
		const fixture = createFixture({
			initial: "/search/a",
			fetch: (query) => Effect.succeed(response(query, 2)),
		})
		await mount(fixture)
		act(() => fixture.refresh("a"))
		await waitFor(() =>
			expect(fixture.renders.at(-1)!.result).toEqual(AsyncData.Success({ data: response("a", 2) }))
		)
		await act(async function () {
			await fixture.router.navigate({ to: "/" })
		})
		const before = fixture.renders.length
		await act(async function () {
			await fixture.router.navigate({ to: "/search/$query", params: { query: "a" } })
		})
		expect(fixture.renders.slice(before)[0]).toMatchObject({
			loaderRevision: 1,
			result: AsyncData.Success({ data: response("a", 2) }),
		})
		expect(fixture.loaderCalls).toEqual(["a"])
	})

	it("rejecting cached data preserves a pending Query request and its completion", async function () {
		const pending = Deferred.makeUnsafe<SearchResponse>()
		let interruptions = 0
		const fixture = createFixture({
			initial: "/search/a",
			fetch: () =>
				Deferred.await(pending).pipe(
					Effect.onInterrupt(() =>
						Effect.sync(function () {
							interruptions += 1
						})
					)
				),
		})
		await mount(fixture)
		act(() => fixture.refresh("a"))
		await waitFor(() => expect(fixture.fetchCalls).toEqual(["a"]))
		await act(async function () {
			await fixture.router.navigate({ to: "/" })
		})
		const before = fixture.renders.length
		await act(async function () {
			await fixture.router.navigate({ to: "/search/$query", params: { query: "a" } })
		})
		expect(AsyncData.isPending(fixture.renders.slice(before)[0]!.result)).toBe(true)
		expect(interruptions).toBe(0)
		act(function () {
			Effect.runSync(Deferred.succeed(pending, response("a", 2)))
		})
		await waitFor(() =>
			expect(fixture.renders.at(-1)!.result).toEqual(AsyncData.Success({ data: response("a", 2) }))
		)
		expect(interruptions).toBe(0)
	})

	it("Query refresh failure retains good data independently of loader policy", async function () {
		const fixture = createFixture({ initial: "/search/a", fetch: () => Effect.fail("unavailable") })
		await mount(fixture)
		act(() => fixture.refresh("a"))
		await waitFor(() =>
			expect(fixture.renders.at(-1)!.result).toEqual(
				AsyncData.Stale({ data: response("a"), error: "unavailable" })
			)
		)
	})
})
