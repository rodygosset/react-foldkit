import { Match, Schema } from "effect"

/**
 * The theme the visitor picked, and the light or dark theme the page shows. The Foldkit website
 * models its theme switch the same way.
 */

export const ThemePreference = Schema.Literals(["System", "Light", "Dark"])
export type ThemePreference = typeof ThemePreference.Type

export const ResolvedTheme = Schema.Literals(["Light", "Dark"])
export type ResolvedTheme = typeof ResolvedTheme.Type

export const themeStorageKey = "react-foldkit-theme"
export const darkSchemeQuery = "(prefers-color-scheme: dark)"

export const toResolvedTheme = (isDark: boolean): ResolvedTheme => (isDark ? "Dark" : "Light")

export const resolveTheme = (preference: ThemePreference, systemTheme: ResolvedTheme): ResolvedTheme =>
	Match.value(preference).pipe(
		Match.withReturnType<ResolvedTheme>(),
		Match.when("Light", () => "Light"),
		Match.when("Dark", () => "Dark"),
		Match.when("System", () => systemTheme),
		Match.exhaustive
	)

const nextPreferences: Record<ThemePreference, ThemePreference> = { System: "Light", Light: "Dark", Dark: "System" }

/** The theme button moves through the preferences in this order: system, light, then dark. */
export const nextThemePreference = (preference: ThemePreference): ThemePreference => nextPreferences[preference]

const quoted = (preference: ThemePreference): string => JSON.stringify(preference)

/**
 * Applies the saved theme from the document head, before the first paint and before any module
 * loads. It repeats `resolveTheme` in plain JavaScript, built from the constants above.
 */
export const applySavedThemeScript = `try{var p=localStorage.getItem(${JSON.stringify(themeStorageKey)});var d=p===${quoted("Dark")}||(p!==${quoted("Light")}&&matchMedia(${JSON.stringify(darkSchemeQuery)}).matches);document.documentElement.classList.toggle("dark",d)}catch(e){}`
