import * as Project from "@/entities/project"
import type * as React from "react"
import * as Application from "../model/application"

export function Provider({ children }: { children: React.ReactNode }) {
	return (
		<Application.Provider init={Application.init()}>
			<Project.Provider
				from={Application.Application}
				lift={Application.projects}
			>
				{children}
			</Project.Provider>
		</Application.Provider>
	)
}
