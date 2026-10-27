import { createFileRoute, redirect } from "@tanstack/react-router"
import { firstGuide } from "../../site/guides"

export const Route = createFileRoute("/docs/")({
	beforeLoad() {
		throw redirect({ to: "/docs/$slug", params: { slug: firstGuide.slug } })
	},
})
