import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import React from "react"
import { afterEach, expect, it } from "vitest"

afterEach(cleanup)

// Run this against a browser. Happy DOM does not restore the previous radio on cancellation.
it("React DOM restores the whole radio group when a click is canceled", function () {
	const seen: boolean[] = []
	render(
		<main onClick={(event) => event.preventDefault()}>
			<input
				type="radio"
				name="choice"
				aria-label="A"
				defaultChecked
			/>
			<input
				type="radio"
				name="choice"
				aria-label="B"
				onChange={(event) => seen.push(event.currentTarget.checked)}
			/>
		</main>
	)
	act(function () {
		fireEvent.click(screen.getByRole("radio", { name: "B" }))
	})
	expect((screen.getByRole("radio", { name: "A" }) as HTMLInputElement).checked).toBe(true)
	expect((screen.getByRole("radio", { name: "B" }) as HTMLInputElement).checked).toBe(false)
	expect(seen).toEqual([true])
})
