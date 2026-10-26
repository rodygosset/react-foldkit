import { Duration, Effect, Option, Schema, Stream } from "effect"
import * as Command from "foldkit/command"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"
import * as Subscription from "foldkit/subscription"
import type * as Update from "foldkit/update"
import * as Program from "react-foldkit/program"
import { getRouter } from "../router"

/**
 * The docs site's own state: the theme, the phone menu, copy-button feedback, and the file
 * the hero's code window shows. Every browser API it touches runs in a Command or a Subscription.
 */

const themeStorageKey = "react-foldkit-theme"
const darkSchemeQuery = "(prefers-color-scheme: dark)"
const copiedFeedback = Duration.millis(1500)

// MODEL

export const Theme = Schema.Literals(["light", "dark", "system"])
export type Theme = typeof Theme.Type

export const HeroTab = Schema.Literals(["program", "react", "foldkit"])
export type HeroTab = typeof HeroTab.Type

export const Model = Schema.Struct({
	theme: Theme,
	systemPrefersDark: Schema.Boolean,
	isMenuOpen: Schema.Boolean,
	copiedBlockId: Schema.Option(Schema.String),
	heroTab: HeroTab,
})
export type Model = typeof Model.Type

export const usesDarkScheme = (model: Model): boolean =>
	model.theme === "system" ? model.systemPrefersDark : model.theme === "dark"

// MESSAGE

export const Message = defineMessageUnion({
	ChoseTheme: { theme: Theme },
	LoadedTheme: { theme: Theme, systemPrefersDark: Schema.Boolean },
	ChangedSystemScheme: { prefersDark: Schema.Boolean },
	SavedTheme: {},
	AppliedColorScheme: {},
	ClickedMenuButton: {},
	ClosedMenu: {},
	ChangedPath: {},
	ClickedCopy: { blockId: Schema.String, text: Schema.String },
	SucceededCopy: { blockId: Schema.String },
	FailedCopy: {},
	ElapsedCopiedFeedback: { blockId: Schema.String },
	ChoseHeroTab: { tab: HeroTab },
	PressedEscape: {},
	ClickedInternalLink: { href: Schema.String },
	Navigated: {},
})
export type Message = typeof Message.Type

type UpdateReturn = Update.Return<Model, Message>

// COMMAND

function readStoredTheme(): Theme {
	const stored = localStorage.getItem(themeStorageKey)
	return Schema.is(Theme)(stored) ? stored : "system"
}

export const LoadTheme = Command.define("LoadTheme", {
	messages: [Message.LoadedTheme],
	execute: Effect.sync(() =>
		Message.LoadedTheme({ theme: readStoredTheme(), systemPrefersDark: matchMedia(darkSchemeQuery).matches })
	).pipe(Effect.orElseSucceed(() => Message.LoadedTheme({ theme: "system", systemPrefersDark: false }))),
})

export const SaveTheme = Command.define("SaveTheme", {
	args: { theme: Theme },
	messages: [Message.SavedTheme],
	execute: ({ theme }) =>
		Effect.sync(() => localStorage.setItem(themeStorageKey, theme)).pipe(
			Effect.ignore,
			Effect.as(Message.SavedTheme())
		),
})

/** The inline script in the document head applies the same class before the first paint. */
export const ApplyColorScheme = Command.define("ApplyColorScheme", {
	args: { isDark: Schema.Boolean },
	messages: [Message.AppliedColorScheme],
	execute: ({ isDark }) =>
		Effect.sync(() => document.documentElement.classList.toggle("dark", isDark)).pipe(
			Effect.as(Message.AppliedColorScheme())
		),
})

export const CopyToClipboard = Command.define("CopyToClipboard", {
	args: { blockId: Schema.String, text: Schema.String },
	messages: [Message.SucceededCopy, Message.FailedCopy],
	execute: ({ blockId, text }) =>
		Effect.tryPromise(() => navigator.clipboard.writeText(text)).pipe(
			Effect.as(Message.SucceededCopy({ blockId })),
			Effect.orElseSucceed(() => Message.FailedCopy())
		),
})

export const WaitToClearCopied = Command.define("WaitToClearCopied", {
	args: { blockId: Schema.String },
	messages: [Message.ElapsedCopiedFeedback],
	execute: ({ blockId }) => Effect.sleep(copiedFeedback).pipe(Effect.as(Message.ElapsedCopiedFeedback({ blockId }))),
})

/** Links inside rendered guides are plain anchors, so their clicks navigate through here. */
export const NavigateTo = Command.define("NavigateTo", {
	args: { href: Schema.String },
	messages: [Message.Navigated],
	execute: ({ href }) => Effect.promise(() => getRouter().navigate({ href })).pipe(Effect.as(Message.Navigated())),
})

// UPDATE

const withColorScheme = (model: Model, previous: Model): UpdateReturn =>
	usesDarkScheme(model) === usesDarkScheme(previous)
		? { model }
		: { model, commands: [ApplyColorScheme({ isDark: usesDarkScheme(model) })] }

export const update = (model: Model, message: Message): UpdateReturn =>
	Message.match<UpdateReturn>(message, {
		ChoseTheme({ theme }) {
			const next = modifyFields(model, { theme: () => theme })
			return { model: next, commands: [SaveTheme({ theme }), ApplyColorScheme({ isDark: usesDarkScheme(next) })] }
		},
		LoadedTheme({ theme, systemPrefersDark }) {
			const next = modifyFields(model, { theme: () => theme, systemPrefersDark: () => systemPrefersDark })
			return { model: next, commands: [ApplyColorScheme({ isDark: usesDarkScheme(next) })] }
		},
		ChangedSystemScheme: ({ prefersDark }) =>
			withColorScheme(modifyFields(model, { systemPrefersDark: () => prefersDark }), model),
		SavedTheme: () => ({ model }),
		AppliedColorScheme: () => ({ model }),
		ClickedMenuButton: () => ({ model: modifyFields(model, { isMenuOpen: (isOpen) => !isOpen }) }),
		ClosedMenu: () => ({ model: modifyFields(model, { isMenuOpen: () => false }) }),
		ChangedPath: () => ({ model: modifyFields(model, { isMenuOpen: () => false }) }),
		ClickedCopy: ({ blockId, text }) => ({ model, commands: [CopyToClipboard({ blockId, text })] }),
		SucceededCopy: ({ blockId }) => ({
			model: modifyFields(model, { copiedBlockId: () => Option.some(blockId) }),
			commands: [WaitToClearCopied({ blockId })],
		}),
		FailedCopy: () => ({ model }),
		ElapsedCopiedFeedback: ({ blockId }) => ({
			model: Option.contains(model.copiedBlockId, blockId)
				? modifyFields(model, { copiedBlockId: () => Option.none() })
				: model,
		}),
		ChoseHeroTab: ({ tab }) => ({ model: modifyFields(model, { heroTab: () => tab }) }),
		PressedEscape: () => ({ model: modifyFields(model, { isMenuOpen: () => false }) }),
		ClickedInternalLink: ({ href }) => ({
			model: modifyFields(model, { isMenuOpen: () => false }),
			commands: [NavigateTo({ href })],
		}),
		Navigated: () => ({ model }),
	})

// INIT

export const initialModel: Model = {
	theme: "system",
	systemPrefersDark: false,
	isMenuOpen: false,
	copiedBlockId: Option.none(),
	heroTab: "program",
}

const init = (): UpdateReturn => ({ model: initialModel, commands: [LoadTheme()] })

// SUBSCRIPTION

const subscriptions = Subscription.make<Model, Message>()((entry) => ({
	systemScheme: entry(
		{ followsSystem: Schema.Boolean },
		{
			modelToDependencies: (model) => ({ followsSystem: model.theme === "system" }),
			dependenciesToStream: ({ followsSystem }) =>
				followsSystem
					? Stream.fromEventListener<MediaQueryListEvent>(matchMedia(darkSchemeQuery), "change").pipe(
							Stream.map((event) => Message.ChangedSystemScheme({ prefersDark: event.matches }))
						)
					: Stream.empty,
		}
	),
	escapeKey: entry(
		{ isMenuOpen: Schema.Boolean },
		{
			modelToDependencies: (model) => ({ isMenuOpen: model.isMenuOpen }),
			dependenciesToStream: ({ isMenuOpen }) =>
				isMenuOpen
					? Stream.fromEventListener<KeyboardEvent>(window, "keydown").pipe(
							Stream.filter((event) => event.key === "Escape"),
							Stream.map(() => Message.PressedEscape())
						)
					: Stream.empty,
		}
	),
}))

export const site = Program.make({ Model, Message, init, update, subscriptions })
