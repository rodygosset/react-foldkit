import * as Project from "@/entities/project"
import type * as React from "react"
import * as Application from "./application"

export function Provider({ children }: { children: React.ReactNode }) {
	return (
		<Application.Provider init={Application.init()}>
			<Project.Provider
				from={Application.Application}
				lift={Application.projectsProjection}
			>
				{children}
			</Project.Provider>
		</Application.Provider>
	)
}
