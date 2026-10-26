import { cn } from "@workspace/ui/lib/utils"
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { Site } from "../application"
import type { Theme } from "../program"

const options: ReadonlyArray<{ readonly theme: Theme; readonly label: string; readonly Icon: typeof SunIcon }> = [
	{ theme: "light", label: "Light theme", Icon: SunIcon },
	{ theme: "dark", label: "Dark theme", Icon: MoonIcon },
	{ theme: "system", label: "System theme", Icon: MonitorIcon },
]

export function ThemeToggle() {
	const theme = Site.useModel((model) => model.theme)
	const send = Site.useSend()

	return (
		<div
			role="group"
			aria-label="Theme"
			className="flex items-center rounded-md border p-0.5"
		>
			{options.map(({ theme: option, label, Icon }) => (
				<button
					key={option}
					type="button"
					aria-label={label}
					aria-pressed={theme === option}
					title={label}
					className={cn(
						"inline-flex size-7 items-center justify-center rounded-[4px] text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
						theme === option && "bg-foreground text-background hover:text-background"
					)}
					onClick={() => send.ChoseTheme({ theme: option })}
				>
					<Icon className="size-3.5" />
				</button>
			))}
		</div>
	)
}
