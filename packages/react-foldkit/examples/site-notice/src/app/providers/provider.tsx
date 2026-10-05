import * as Notice from "@/entities/notice"
import { useRouter } from "@tanstack/react-router"
import * as React from "react"
import * as Loader from "react-foldkit/loader"
import * as TanStackSource from "react-foldkit/tanstack"
import * as Application from "../model/application"

export function Provider({ children }: { children: React.ReactNode }) {
	const router = useRouter()
	const [source] = React.useState(() =>
		TanStackSource.make(router, [
			Notice.loader.pipe(Loader.mapMessages((notice) => Application.Message.CompletedLoadNotice({ notice }))),
		])
	)

	return (
		<Application.Provider
			init={Application.init()}
			commitSource={source}
		>
			{children}
		</Application.Provider>
	)
}
