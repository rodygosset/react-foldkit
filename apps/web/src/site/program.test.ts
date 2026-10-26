import { modifyFields } from "foldkit/struct"
import { Command, given, message, model, story } from "foldkit/story"
import { describe, expect, test } from "vitest"
import { ApplyTheme, Message, NavigateTo, initialModel, update } from "./program"
import { applySavedThemeScript, darkSchemeQuery, themeStorageKey } from "./theme"

const menuOpen = modifyFields(initialModel, { isMenuOpen: () => true })

describe("theme", function () {
	test("applies the saved theme once it loads", function () {
		story(
			update,
			given(initialModel),
			message(Message.CompletedLoadTheme({ themePreference: "System", systemTheme: "Dark" })),
			Command.expectExact(ApplyTheme({ theme: "Dark" })),
			Command.resolve(ApplyTheme, Message.CompletedApplyTheme()),
			model(function (model) {
				expect(model.systemTheme).toBe("Dark")
			})
		)
	})

	test("follows the system theme while the preference is system", function () {
		story(
			update,
			given(initialModel),
			message(Message.ChangedSystemTheme({ theme: "Dark" })),
			Command.expectExact(ApplyTheme({ theme: "Dark" })),
			Command.resolve(ApplyTheme, Message.CompletedApplyTheme())
		)
	})

	test("keeps the chosen theme when the system theme changes", function () {
		story(
			update,
			given(modifyFields(initialModel, { themePreference: () => "Light" })),
			message(Message.ChangedSystemTheme({ theme: "Dark" })),
			Command.expectExact(ApplyTheme({ theme: "Light" })),
			Command.resolve(ApplyTheme, Message.CompletedApplyTheme())
		)
	})
})

describe("first-paint theme script", function () {
	function runScript(saved: string | null) {
		document.documentElement.classList.remove("dark")
		localStorage.clear()
		if (saved !== null) localStorage.setItem(themeStorageKey, saved)
		// oxlint-disable-next-line typescript/no-implied-eval -- Runs the inline head script, as the browser does.
		new Function(applySavedThemeScript)()
		return document.documentElement.classList.contains("dark")
	}

	test("reads the value that SaveTheme writes", function () {
		expect(runScript("Dark")).toBe(true)
		expect(runScript("Light")).toBe(false)
	})

	test("falls back to the system theme without a saved value", function () {
		expect(runScript(null)).toBe(matchMedia(darkSchemeQuery).matches)
	})
})

describe("phone menu", function () {
	test("closes when the page changes", function () {
		story(
			update,
			given(menuOpen),
			message(Message.ChangedPath()),
			model(function (model) {
				expect(model.isMenuOpen).toBe(false)
			})
		)
	})

	test("closes on Escape", function () {
		story(
			update,
			given(menuOpen),
			message(Message.PressedEscape()),
			model(function (model) {
				expect(model.isMenuOpen).toBe(false)
			})
		)
	})
})

describe("guide links", function () {
	test("navigate through a Command", function () {
		story(
			update,
			given(initialModel),
			message(Message.ClickedInternalLink({ href: "/docs/routing" })),
			Command.expectExact(NavigateTo({ href: "/docs/routing" })),
			Command.resolve(NavigateTo, Message.CompletedNavigateTo())
		)
	})
})
