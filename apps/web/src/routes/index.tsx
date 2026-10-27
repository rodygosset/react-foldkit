import { createFileRoute } from "@tanstack/react-router"
import { HomePage } from "../home/home-page"

export const Route = createFileRoute("/")({
	head: () => ({ meta: [{ title: "react-foldkit · Move your React app to Foldkit" }] }),
	component: HomePage,
})
