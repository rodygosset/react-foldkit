import { RouterProvider } from "@tanstack/react-router"
import { hydrate } from "@tanstack/react-router/ssr/client"
import { createRequestHandler, renderRouterToString, RouterServer } from "@tanstack/react-router/ssr/server"
import { act } from "@testing-library/react"
import { hydrateRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import * as AsyncData from "../../src/asyncData"
import { createFixture, response } from "../fixtures/route-loader"

afterEach(() => {
	document.documentElement.innerHTML = "<head></head><body></body>"
	delete window.$_TSR
	Reflect.deleteProperty(window, "$R")
})

async function serverHtml(fixture: ReturnType<typeof createFixture>) {
	const request = new Request(`http://localhost${fixture.router.history.location.href}`)
	const handler = createRequestHandler({ createRouter: () => fixture.router, request })
	const response = await handler(({ router, responseHeaders }) =>
		renderRouterToString({ router, responseHeaders, children: <RouterServer router={router} /> })
	)
	expect(response.status).toBe(200)
	return response.text()
}

function installTransportedHtml(html: string) {
	document.open()
	document.write(html)
	document.close()
	// Happy DOM does not run inline scripts by default. Execute the actual
	// TanStack-generated transport scripts, not a hand-built hydration payload.
	for (const script of document.querySelectorAll("script")) {
		if (!script.src && script.textContent) {
			const current = vi.spyOn(document, "currentScript", "get").mockReturnValue(script)
			try {
				window.eval(script.textContent)
			} finally {
				current.mockRestore()
			}
		}
	}
}

describe("route loader SSR/hydration", () => {
	it(
		"the real SSR transport preserves encoded payloads, receipts, and the first Model",
		async () => {
			const server = createFixture({
				initial: "/search/a",
				isServer: true,
			})
			const html = await serverHtml(server)
			expect(html).toContain("a:1")
			expect(server.loaderCalls).toEqual(["a"])
			expect(server.layoutMounts).toBe(0)
			expect(server.renders[0]!.result).toEqual(AsyncData.Success({ data: response("a") }))
			installTransportedHtml(html)
			expect(window.$_TSR?.router?.matches.some((match) => match.l)).toBe(true)

			const client = createFixture({
				initial: "/search/a",
				documentShell: true,
			})
			// Use the same public hydration function as RouterClient, but await it
			// explicitly to avoid RouterClient's module-wide promise across test cases.
			await hydrate(client.router)
			const recoverableErrors: unknown[] = []
			let root: Root | undefined
			try {
				await act(async () => {
					root = hydrateRoot(document, <RouterProvider router={client.router} />, {
						onRecoverableError: (error) => recoverableErrors.push(error),
					})
				})
				expect(client.loaderCalls).toEqual([])
				expect(client.resolvedEntries.map(({ version }) => version)).toEqual(
					server.resolvedEntries.map(({ version }) => version)
				)
				expect(recoverableErrors).toEqual([])
				expect(document.querySelector('[data-testid="search"]')?.textContent).toBe("a:1")
				expect(client.renders[0]!.model).toEqual(server.renders[0]!.model)
				expect(client.renders[0]!.result).toEqual(AsyncData.Success({ data: response("a") }))
				if (AsyncData.isSuccess(client.renders[0]!.result)) {
					expect(client.renders[0]!.result.data.fetchedAt).toBeInstanceOf(Date)
				}
				await act(async () => {
					await client.router.navigate({ to: "/search/$query", params: { query: "b" } })
				})
				expect(client.renders.find(({ routeQuery }) => routeQuery === "b")!.modelQuery).toBe("b")
				expect(client.layoutMounts).toBe(1)
			} finally {
				await act(async () => root?.unmount())
			}
		}
	)
})
