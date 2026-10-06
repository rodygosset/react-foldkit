import * as Project from "@/entities/project"
import { useRouter } from "@tanstack/react-router"
import * as React from "react"
import * as Loader from "react-foldkit/loader"
import * as TanStackSource from "react-foldkit/tanstack"
import * as Application from "../model/application"

export function Provider({ children }: { children: React.ReactNode }) {
	const router = useRouter()

	return (
		<Application.Provider
			init={Application.init()}
			createCommitSource={() =>
				TanStackSource.make(router, [
					Project.loader.pipe(
						Loader.mapMessages((load) => Application.Message.CompletedLoadProject({ load }))
					),
				])
			}
		>
			<Application.SubmodelProvider
				projection={Application.projectsProjection}
				render={({ source }) => <Project.Provider source={source}>{children}</Project.Provider>}
			/>
		</Application.Provider>
	)
}
