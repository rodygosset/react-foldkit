import { Command, click, expect, given, role, scene } from "react-foldkit/scene"
import { bindSceneView } from "react-foldkit/scene/react"
import { describe, expect as assert, test, vi } from "vitest"
import { Site } from "./application"
import { CopyButton } from "./components/copy-button"
import { MenuButton, MobileMenu } from "./components/mobile-menu"
import { CodeSheet } from "./components/code-sheet"
import { ThemeButton } from "./components/theme-button"
import {
	ApplyColorScheme,
	CopyToClipboard,
	Message,
	SaveTheme,
	WaitToClearCopied,
	initialModel,
	update,
} from "./program"
import type { Model } from "./program"

// The router module loads every route and the build-time content. These tests never navigate.
vi.mock("../router", () => ({ getRouter: vi.fn() }))

const installCommand = "npm install react-foldkit"

const sheetTabs = [
	{ tab: "program", file: "program.ts", snippet: { code: "const a = 1", html: "<pre>const a = 1</pre>" } },
	{ tab: "view", file: "view.tsx", snippet: { code: "const b = 2", html: "<pre>const b = 2</pre>" } },
] as const

/** Opens the code sheet, like the hero's "View the code" button. */
function ShowCodeButton() {
	const send = Site.useSend()
	return <button onClick={() => send.ClickedShowCode()}>View the code</button>
}

/** The site's controls, without the router Links around them in the real nav. */
function SiteControls() {
	return (
		<main>
			<ThemeButton />
			<MenuButton />
			<MobileMenu>
				<a href="/docs/routing">Use a router</a>
			</MobileMenu>
			<CopyButton
				blockId="install"
				text={installCommand}
			/>
			<ShowCodeButton />
			<CodeSheet
				title="Counter source"
				tabs={sheetTabs}
			/>
		</main>
	)
}

const view = bindSceneView(Site, SiteControls)

describe("theme button", function () {
	test("moves from system to light to dark, saving each choice", function () {
		scene(
			{ update, view },
			given(initialModel),

			click(role("button", { name: "Switch to light theme" })),
			Command.expectExact(SaveTheme({ theme: "light" }), ApplyColorScheme({ isDark: false })),
			Command.resolve(SaveTheme, Message.SavedTheme()),
			Command.resolve(ApplyColorScheme, Message.AppliedColorScheme()),

			click(role("button", { name: "Switch to dark theme" })),
			Command.expectExact(SaveTheme({ theme: "dark" }), ApplyColorScheme({ isDark: true })),
			Command.resolve(SaveTheme, Message.SavedTheme()),
			Command.resolve(ApplyColorScheme, Message.AppliedColorScheme()),
			expect(role("button", { name: "Switch to system theme" })).toExist()
		)
	})

	test("follows the system color scheme when the theme is system", function () {
		const prefersDark: Model = { ...initialModel, theme: "dark", systemPrefersDark: true }
		scene(
			{ update, view },
			given(prefersDark),

			click(role("button", { name: "Switch to system theme" })),
			Command.expectExact(SaveTheme({ theme: "system" }), ApplyColorScheme({ isDark: true })),
			Command.resolve(SaveTheme, Message.SavedTheme()),
			Command.resolve(ApplyColorScheme, Message.AppliedColorScheme())
		)
	})
})

describe("phone menu", function () {
	test("opens and closes from the menu button", function () {
		scene(
			{ update, view },
			given(initialModel),
			expect(role("navigation", { name: "Site" })).toBeAbsent(),
			expect(role("button", { name: "Open menu" })).toHaveAttr("aria-expanded", "false"),

			click(role("button", { name: "Open menu" })),
			expect(role("navigation", { name: "Site" })).toExist(),
			expect(role("link", { name: "Use a router" })).toExist(),
			expect(role("button", { name: "Close menu" })).toHaveAttr("aria-expanded", "true"),

			click(role("button", { name: "Close menu" })),
			expect(role("navigation", { name: "Site" })).toBeAbsent()
		)
	})

	test("closes when the page changes", function () {
		const { model, commands } = update({ ...initialModel, isMenuOpen: true }, Message.ChangedPath())
		assert(model.isMenuOpen).toBe(false)
		assert(commands).toBeUndefined()
	})
})

describe("copy button", function () {
	test("shows Copied until the feedback delay ends", function () {
		scene(
			{ update, view },
			given(initialModel),

			click(role("button", { name: "Copy code" })),
			Command.expectExact(CopyToClipboard({ blockId: "install", text: installCommand })),
			Command.resolve(CopyToClipboard, Message.SucceededCopy({ blockId: "install" })),
			expect(role("button", { name: "Copied" })).toExist(),

			Command.expectExact(WaitToClearCopied({ blockId: "install" })),
			Command.resolve(WaitToClearCopied, Message.ElapsedCopiedFeedback({ blockId: "install" })),
			expect(role("button", { name: "Copy code" })).toExist()
		)
	})

	test("keeps the copy label when the clipboard refuses", function () {
		scene(
			{ update, view },
			given(initialModel),

			click(role("button", { name: "Copy code" })),
			Command.resolve(CopyToClipboard, Message.FailedCopy()),
			expect(role("button", { name: "Copy code" })).toExist()
		)
	})
})

describe("code sheet", function () {
	test("opens, switches tabs, and closes", function () {
		scene(
			{ update, view },
			given(initialModel),
			expect(role("dialog", { name: "Counter source" })).toBeAbsent(),

			click(role("button", { name: "View the code" })),
			expect(role("dialog", { name: "Counter source" })).toExist(),
			expect(role("tab", { name: "program.ts" })).toHaveAttr("aria-selected", "true"),

			click(role("tab", { name: "view.tsx" })),
			expect(role("tab", { name: "view.tsx" })).toHaveAttr("aria-selected", "true"),

			click(role("button", { name: "Close" })),
			expect(role("dialog", { name: "Counter source" })).toBeAbsent()
		)
	})

	test("Escape closes the sheet and the menu", function () {
		const { model } = update({ ...initialModel, isMenuOpen: true, isCodeSheetOpen: true }, Message.PressedEscape())
		assert(model.isMenuOpen).toBe(false)
		assert(model.isCodeSheetOpen).toBe(false)
	})
})
