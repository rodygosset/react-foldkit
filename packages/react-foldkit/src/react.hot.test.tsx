import { act, cleanup, render, screen } from "@testing-library/react"
import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import type * as Update from "foldkit/update"
import React from "react"
import { afterEach, describe, expect, it } from "vitest"
import * as Application from "./application"
import "./application/hot"

afterEach(cleanup)

type Hot = { readonly begin: (url: string) => void; readonly end: () => void }
const hot = (globalThis as typeof globalThis & { [key: symbol]: Hot })[Symbol.for("react-foldkit/hot")]!

const Message = defineMessageUnion({ Clicked: {} })
type Message = typeof Message.Type

const Count = Schema.Struct({ count: Schema.Finite })
type Count = typeof Count.Type

// Evaluates a module the preserveModel plugin wrapped. A changed `?t=` query is a hot reload.
function evaluate<A>(url: string, body: () => A): A {
	hot.begin(url)
	try {
		return body()
	} finally {
		hot.end()
	}
}

const counter = (step: number, initial = 0) =>
	Application.define({
		Model: Count,
		Message,
		init: (): Update.Return<Count, Message> => ({ model: { count: initial } }),
		update: (model: Count, _message: Message) => ({ model: { count: model.count + step } }),
	})

type CounterApp = ReturnType<typeof counter>

function Tree({ app, providerKey }: { readonly app: CounterApp; readonly providerKey?: string }) {
	return (
		<app.Provider key={providerKey}>
			<Button app={app} />
		</app.Provider>
	)
}

function Button({ app }: { readonly app: CounterApp }) {
	const send = app.useSend()
	return <button onClick={() => send.Clicked()}>{app.useModel((model) => model.count)}</button>
}

const click = () => act(() => screen.getByRole("button").click())

describe("hot reload", function () {
	it("keeps the Model and runs the new update after a reload", function () {
		const first = evaluate("file:///counter.tsx", () => counter(1))
		const rendered = render(<Tree app={first} />)
		click()
		click()
		expect(screen.getByRole("button").textContent).toBe("2")

		const second = evaluate("file:///counter.tsx?t=1", () => counter(10))
		expect(second.Provider).toBe(first.Provider)
		rendered.rerender(<Tree app={second} />)
		expect(screen.getByRole("button").textContent).toBe("2")
		click()
		expect(screen.getByRole("button").textContent).toBe("12")
	})

	it("keeps the Model under Strict Mode", function () {
		const first = evaluate("file:///strict.tsx", () => counter(1))
		const rendered = render(
			<React.StrictMode>
				<Tree app={first} />
			</React.StrictMode>
		)
		click()
		const second = evaluate("file:///strict.tsx?t=1", () => counter(1))
		rendered.rerender(
			<React.StrictMode>
				<Tree app={second} />
			</React.StrictMode>
		)
		expect(screen.getByRole("button").textContent).toBe("1")
	})

	it("starts from init when the Model no longer decodes", function () {
		const first = evaluate("file:///schema.tsx", () => counter(1))
		const rendered = render(<Tree app={first} />)
		click()
		const Labeled = Schema.Struct({ count: Schema.Finite, label: Schema.String })
		type Labeled = typeof Labeled.Type
		const second = evaluate("file:///schema.tsx?t=1", () =>
			Application.define({
				Model: Labeled,
				Message,
				init: (): Update.Return<Labeled, Message> => ({ model: { count: 5, label: "new" } }),
				update: (model: Labeled, _message: Message) => ({ model }),
			})
		)
		rendered.rerender(
			<second.Provider>
				<Label app={second} />
			</second.Provider>
		)
		expect(screen.getByTestId("label").textContent).toBe("new:5")
	})

	it("starts from init when a Provider remounts without a reload", function () {
		const app = evaluate("file:///remount.tsx", () => counter(1))
		const rendered = render(
			<Tree
				app={app}
				providerKey="a"
			/>
		)
		click()
		rendered.rerender(
			<Tree
				app={app}
				providerKey="b"
			/>
		)
		expect(screen.getByRole("button").textContent).toBe("0")
	})

	it("starts from init without the plugin", function () {
		const first = counter(1)
		const rendered = render(<Tree app={first} />)
		click()
		const second = counter(1)
		expect(second.Provider).not.toBe(first.Provider)
		rendered.rerender(<Tree app={second} />)
		expect(screen.getByRole("button").textContent).toBe("0")
	})
})

function Label({
	app,
}: {
	readonly app: Application.Application<{ readonly count: number; readonly label: string }, Message>
}) {
	return <span data-testid="label">{app.useModel((model) => `${model.label}:${model.count}`)}</span>
}
