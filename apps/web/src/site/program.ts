import { Boolean, Context, Effect, Option, Schema, Stream } from "effect"
import { KeyValueStore } from "effect/persistence"
import * as Command from "foldkit/command"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"
import * as Subscription from "foldkit/subscription"
import type * as Update from "foldkit/update"
import * as Program from "react-foldkit/program"
import * as Submodel from "react-foldkit/submodel"
import * as SnippetCopy from "./snippet-copy"
import {
	ResolvedTheme,
	ThemePreference,
	darkSchemeQuery,
	nextThemePreference,
	resolveTheme,
	themeStorageKey,
	toResolvedTheme,
} from "./theme"

/**
 * The docs site's own state: the theme, the phone menu, and copy-button feedback. Every browser
 * API it touches runs in a Command or a Subscription, through the services the application supplies.
 */

/** Moves the site to another page. The application supplies it, so this module doesn't import the route tree. */
export class SiteNavigation extends Context.Service<
	SiteNavigation,
	{ readonly navigate: (href: string) => Effect.Effect<void> }
>()("SiteNavigation") {}

type Services = KeyValueStore.KeyValueStore | SiteNavigation

// MODEL

export const Model = Schema.Struct({
	themePreference: ThemePreference,
	systemTheme: ResolvedTheme,
	isMenuOpen: Schema.Boolean,
	snippetCopy: SnippetCopy.Model,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
	ClickedThemeButton: {},
	CompletedLoadTheme: { themePreference: ThemePreference, systemTheme: ResolvedTheme },
	ChangedSystemTheme: { theme: ResolvedTheme },
	CompletedSaveTheme: {},
	CompletedApplyTheme: {},
	ClickedMenuButton: {},
	PressedEscape: {},
	ChangedPath: {},
	ClickedInternalLink: { href: Schema.String },
	CompletedNavigateTo: {},
	GotSnippetCopyMessage: { message: SnippetCopy.Message },
})
export type Message = typeof Message.Type

type UpdateReturn = Update.Return<Model, Message, Services>

// COMMAND

export const LoadTheme = Command.define("LoadTheme", {
	messages: [Message.CompletedLoadTheme],
	execute: Effect.gen(function* () {
		const store = yield* KeyValueStore.KeyValueStore
		const maybeThemePreference = yield* store
			.get(themeStorageKey)
			.pipe(Effect.option, Effect.map(Option.flatMap(Schema.decodeUnknownOption(ThemePreference))))
		const themePreference = Option.getOrElse(maybeThemePreference, (): ThemePreference => "System")
		const systemTheme = toResolvedTheme(matchMedia(darkSchemeQuery).matches)
		return Message.CompletedLoadTheme({ themePreference, systemTheme })
	}),
})

export const SaveTheme = Command.define("SaveTheme", {
	args: { themePreference: ThemePreference },
	messages: [Message.CompletedSaveTheme],
	execute: ({ themePreference }) =>
		Effect.gen(function* () {
			const store = yield* KeyValueStore.KeyValueStore
			yield* store.set(themeStorageKey, themePreference)
			return Message.CompletedSaveTheme()
		}).pipe(Effect.orElseSucceed(() => Message.CompletedSaveTheme())),
})

/** `applySavedThemeScript` in the document head applies the same class before the first paint. */
export const ApplyTheme = Command.define("ApplyTheme", {
	args: { theme: ResolvedTheme },
	messages: [Message.CompletedApplyTheme],
	execute: ({ theme }) =>
		Effect.sync(function () {
			document.documentElement.classList.toggle("dark", theme === "Dark")
			return Message.CompletedApplyTheme()
		}),
})

/** Links inside rendered guides are plain anchors, so their clicks navigate through here. */
export const NavigateTo = Command.define("NavigateTo", {
	args: { href: Schema.String },
	messages: [Message.CompletedNavigateTo],
	execute: ({ href }) =>
		Effect.gen(function* () {
			const navigation = yield* SiteNavigation
			yield* navigation.navigate(href)
			return Message.CompletedNavigateTo()
		}),
})

// UPDATE

export const snippetCopy = Submodel.lift<Model>()({
	field: "snippetCopy",
	update: SnippetCopy.update,
	toParentMessage: (message: SnippetCopy.Message) => Message.GotSnippetCopyMessage({ message }),
})

const applyTheme = (model: Model) => ApplyTheme({ theme: resolveTheme(model.themePreference, model.systemTheme) })

export const update = (model: Model, message: Message) =>
	Message.match<UpdateReturn>(message, {
		ClickedThemeButton() {
			const nextModel = modifyFields(model, { themePreference: nextThemePreference })
			return {
				model: nextModel,
				commands: [SaveTheme({ themePreference: nextModel.themePreference }), applyTheme(nextModel)],
			}
		},
		CompletedLoadTheme({ themePreference, systemTheme }) {
			const nextModel = modifyFields(model, {
				themePreference: () => themePreference,
				systemTheme: () => systemTheme,
			})
			return { model: nextModel, commands: [applyTheme(nextModel)] }
		},
		ChangedSystemTheme({ theme }) {
			const nextModel = modifyFields(model, { systemTheme: () => theme })
			return { model: nextModel, commands: [applyTheme(nextModel)] }
		},
		CompletedSaveTheme: () => ({ model }),
		CompletedApplyTheme: () => ({ model }),
		ClickedMenuButton: () => ({ model: modifyFields(model, { isMenuOpen: Boolean.not }) }),
		PressedEscape: () => ({ model: modifyFields(model, { isMenuOpen: () => false }) }),
		ChangedPath: () => ({ model: modifyFields(model, { isMenuOpen: () => false }) }),
		ClickedInternalLink: ({ href }) => ({ model, commands: [NavigateTo({ href })] }),
		CompletedNavigateTo: () => ({ model }),
		GotSnippetCopyMessage: ({ message }) => snippetCopy.fold(model, message),
	})

// INIT

export const initialModel: Model = {
	themePreference: "System",
	systemTheme: "Light",
	isMenuOpen: false,
	snippetCopy: SnippetCopy.initialModel,
}

const init = (): UpdateReturn => ({ model: initialModel, commands: [LoadTheme()] })

// SUBSCRIPTION

const subscriptions = Subscription.make<Model, Message, Services>()((entry) => ({
	systemTheme: entry(
		{ isSystemPreference: Schema.Boolean },
		{
			modelToDependencies: (model) => ({ isSystemPreference: model.themePreference === "System" }),
			dependenciesToStream: ({ isSystemPreference }) =>
				isSystemPreference
					? Stream.fromEventListener<MediaQueryListEvent>(matchMedia(darkSchemeQuery), "change").pipe(
							Stream.map((event) => Message.ChangedSystemTheme({ theme: toResolvedTheme(event.matches) }))
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
