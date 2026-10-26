import { Command, click, expect, given, role, scene } from "react-foldkit/scene"
import { bindSceneView } from "react-foldkit/scene/react"
import { describe, expect as assert, test, vi } from "vitest"
import { Site } from "./application"
import { CopyButton } from "./components/copy-button"
import { MenuButton, MobileMenu } from "./components/mobile-menu"
import { ThemeToggle } from "./components/theme-toggle"
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

/** The site's controls, without the router Links around them in the real header. */
function SiteControls() {
	return (
		<main>
			<ThemeToggle />
			<MenuButton />
			<MobileMenu>
				<a href="/docs/routing">Use a router</a>
			</MobileMenu>
			<CopyButton
				blockId="install"
				text={installCommand}
			/>
		</main>
	)
}

const view = bindSceneView(Site, SiteControls)

describe("theme toggle", function () {
	test("saves the chosen theme and applies its color scheme", function () {
		scene(
			{ update, view },
			given(initialModel),
			expect(role("button", { name: "System theme" })).toHaveAttr("aria-pressed", "true"),

			click(role("button", { name: "Dark theme" })),
			expect(role("button", { name: "Dark theme" })).toHaveAttr("aria-pressed", "true"),
			expect(role("button", { name: "System theme" })).toHaveAttr("aria-pressed", "false"),
			Command.expectExact(SaveTheme({ theme: "dark" }), ApplyColorScheme({ isDark: true })),
			Command.resolve(SaveTheme, Message.SavedTheme()),
			Command.resolve(ApplyColorScheme, Message.AppliedColorScheme())
		)
	})

	test("follows the system color scheme when the theme is system", function () {
		const prefersDark: Model = { ...initialModel, theme: "light", systemPrefersDark: true }
		scene(
			{ update, view },
			given(prefersDark),

			click(role("button", { name: "System theme" })),
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
