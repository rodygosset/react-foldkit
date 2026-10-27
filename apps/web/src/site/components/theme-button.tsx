import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { Site } from "../application"
import { nextThemePreference } from "../theme"
import type { ThemePreference } from "../theme"

const icons: Record<ThemePreference, typeof SunIcon> = { Light: SunIcon, Dark: MoonIcon, System: MonitorIcon }

/** Shows the current theme. Each click moves to the next one: system, light, then dark. */
export function ThemeButton() {
	const themePreference = Site.useModel((model) => model.themePreference)
	const send = Site.useSend()
	const current = themePreference.toLowerCase()
	const next = nextThemePreference(themePreference).toLowerCase()
	const Icon = icons[themePreference]

	return (
		<button
			type="button"
			aria-label={`Switch to ${next} theme`}
			title={`Theme: ${current}. Switch to ${next}.`}
			className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			onClick={() => send.ClickedThemeButton()}
		>
			<Icon className="size-4" />
		</button>
	)
}
