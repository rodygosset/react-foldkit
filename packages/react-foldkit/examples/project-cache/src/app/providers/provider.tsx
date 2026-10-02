import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import * as Loader from "react-foldkit/loader"
import * as TanStackSource from "react-foldkit/tanstack"
import * as Project from "@/entities/project"
import * as Application from "../model/application"

export function Provider({ children }: { children: React.ReactNode }) {
	const router = useRouter()
	const [source] = React.useState(function () {
		return TanStackSource.make(router, [
			Project.Loader.pipe(
				Loader.mapMessages(function (load) {
					return Application.Message.CompletedLoadProject({ load })
				})
			),
		])
	})

	return (
		<Application.Provider init={Application.init()} commitSource={source}>
			<Application.SubmodelProvider
				projection={Application.projectsProjection}
				render={function ({ source }) {
					return <Project.Provider source={source}>{children}</Project.Provider>
				}}
			/>
		</Application.Provider>
	)
}
