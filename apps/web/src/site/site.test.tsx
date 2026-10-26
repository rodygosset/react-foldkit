import { modifyFields } from "foldkit/struct"
import { Command, click, expect, given, role, scene } from "react-foldkit/scene"
import { bindSceneView } from "react-foldkit/scene/react"
import { describe, test, vi } from "vitest"
import { Site } from "./application"
import { CopyButton } from "./components/copy-button"
import { MenuButton, MobileMenu } from "./components/mobile-menu"
import { ThemeButton } from "./components/theme-button"
import { ApplyTheme, Message, SaveTheme, initialModel, snippetCopy, update } from "./program"
import * as SnippetCopy from "./snippet-copy"

// The application's navigation service imports the router, which loads every route and the
// build-time content. Scene tests never run Commands, so nothing here navigates.
vi.mock("../router", () => ({ getRouter: vi.fn() }))

const installCommand = "npm install react-foldkit"

/** The site's controls, without the router Links around them in the real nav. */
function SiteControls() {
	return (
		<SnippetCopy.Provider
			from={Site}
			lift={snippetCopy}
		>
			<main>
				<ThemeButton />
				<MenuButton />
				<MobileMenu>
					<a href="/docs/routing">Use a router</a>
				</MobileMenu>
				<CopyButton
					snippetId="install"
					text={installCommand}
				/>
			</main>
		</SnippetCopy.Provider>
	)
}

const view = bindSceneView(Site, SiteControls)

describe("theme button", function () {
	test("moves from system to light to dark, saving each choice", function () {
		scene(
			{ update, view },
			given(initialModel),

			click(role("button", { name: "Switch to light theme" })),
			Command.expectExact(SaveTheme({ themePreference: "Light" }), ApplyTheme({ theme: "Light" })),
			Command.resolve(SaveTheme, Message.CompletedSaveTheme()),
			Command.resolve(ApplyTheme, Message.CompletedApplyTheme()),

			click(role("button", { name: "Switch to dark theme" })),
			Command.expectExact(SaveTheme({ themePreference: "Dark" }), ApplyTheme({ theme: "Dark" })),
			Command.resolve(SaveTheme, Message.CompletedSaveTheme()),
			Command.resolve(ApplyTheme, Message.CompletedApplyTheme()),
			expect(role("button", { name: "Switch to system theme" })).toExist()
		)
	})

	test("applies the system theme when it moves back to system", function () {
		const darkSystem = modifyFields(initialModel, { themePreference: () => "Dark", systemTheme: () => "Dark" })
		scene(
			{ update, view },
			given(darkSystem),

			click(role("button", { name: "Switch to system theme" })),
			Command.expectExact(SaveTheme({ themePreference: "System" }), ApplyTheme({ theme: "Dark" })),
			Command.resolve(SaveTheme, Message.CompletedSaveTheme()),
			Command.resolve(ApplyTheme, Message.CompletedApplyTheme())
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
})

describe("copy button", function () {
	test("shows Copied until the indicator delay ends", function () {
		scene(
			{ update, view },
			given(initialModel),

			click(role("button", { name: "Copy code" })),
			Command.expectExact(SnippetCopy.CopySnippet({ snippetId: "install", text: installCommand })),
			Command.resolve(
				SnippetCopy.CopySnippet,
				SnippetCopy.Message.SucceededCopySnippet({ snippetId: "install" })
			),
			expect(role("button", { name: "Copied" })).toExist(),

			Command.expectExact(SnippetCopy.WaitBeforeHidingCopiedIndicator({ snippetId: "install" })),
			Command.resolve(
				SnippetCopy.WaitBeforeHidingCopiedIndicator,
				SnippetCopy.Message.CompletedWaitBeforeHidingCopiedIndicator({ snippetId: "install" })
			),
			expect(role("button", { name: "Copy code" })).toExist()
		)
	})

	test("keeps the copy label when the clipboard refuses", function () {
		scene(
			{ update, view },
			given(initialModel),

			click(role("button", { name: "Copy code" })),
			Command.resolve(SnippetCopy.CopySnippet, SnippetCopy.Message.FailedCopySnippet()),
			expect(role("button", { name: "Copy code" })).toExist()
		)
	})
})
