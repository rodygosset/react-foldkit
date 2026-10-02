import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import * as Loader from "react-foldkit/loader"
import * as TanStackSource from "react-foldkit/tanstack"
import * as Notice from "@/entities/notice"
import * as Application from "../model/application"

export function Provider({ children }: { children: React.ReactNode }) {
	const router = useRouter()
	const [source] = React.useState(function () {
		return TanStackSource.make(router, [
			Notice.Loader.pipe(
				Loader.mapMessages(function (notice) {
					return Application.Message.CompletedLoadNotice({ notice })
				})
			),
		])
	})

	return (
		<Application.Provider init={Application.init()} commitSource={source}>
			{children}
		</Application.Provider>
	)
}
