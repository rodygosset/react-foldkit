import { it } from "@effect/vitest"
import { RouterProvider } from "@tanstack/react-router"
import { Effect } from "effect"
import React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect } from "vitest"
import * as AsyncData from "../../src/asyncData"
import { createFixture, response } from "../fixtures/routeLoader"

let root: Root | undefined
let container: HTMLDivElement | undefined

afterEach(function () {
	root?.unmount()
	container?.remove()
	root = undefined
	container = undefined
})

describe("route loader delivery with the native browser scheduler", function () {
	it.live.each(["navigation", "revalidation"] as const)(
		"%s publishes loader data before its first render despite queued edits",
		(operation) =>
			Effect.gen(function* () {
				const expectedRevision = operation === "revalidation" ? 2 : 1
				let revision = 1
				let pressured = false
				const fixture = createFixture({
					initial: operation === "revalidation" ? "/search/a" : "/",
					load: (query) => Effect.sync(() => response(query, revision)),
					onBurn() {
						// Exceed the real store's 5 ms drain budget without replacing its clock or channel.
						const end = performance.now() + 12
						while (performance.now() < end) {}
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
					},
				})
				yield* Effect.promise(() => fixture.router.load())
				container = document.createElement("div")
				document.body.append(container)
				root = createRoot(container)
				root.render(
					<React.StrictMode>
						<RouterProvider router={fixture.router} />
					</React.StrictMode>
				)
				yield* Effect.promise(() => expect.poll(() => fixture.layoutMounts).toBe(2))
				const before = fixture.renders.length
				if (operation === "revalidation") {
					revision = 2
					yield* Effect.promise(() => fixture.router.invalidate())
				} else {
					yield* Effect.promise(() =>
						fixture.router.navigate({ to: "/search/$query", params: { query: "a" } })
					)
				}
				yield* Effect.promise(() =>
					expect
						.poll(() =>
							fixture.renders
								.slice(before)
								.find(({ loaderRevision }) => loaderRevision === expectedRevision)
						)
						.toBeDefined()
				)
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
				expect(fixture.layoutMounts).toBe(2)
			})
	)
})
