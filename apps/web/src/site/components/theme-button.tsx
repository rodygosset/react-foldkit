import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { Site } from "../application"
import type { Theme } from "../program"

const nextTheme: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" }
const icons: Record<Theme, typeof SunIcon> = { light: SunIcon, dark: MoonIcon, system: MonitorIcon }

/** Shows the current theme. Each click moves to the next one: system, light, then dark. */
export function ThemeButton() {
	const theme = Site.useModel((model) => model.theme)
	const send = Site.useSend()
	const next = nextTheme[theme]
	const Icon = icons[theme]

	return (
		<button
			type="button"
			aria-label={`Switch to ${next} theme`}
			title={`Theme: ${theme}. Switch to ${next}.`}
			className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			onClick={() => send.ChoseTheme({ theme: next })}
		>
			<Icon className="size-4" />
		</button>
	)
}
