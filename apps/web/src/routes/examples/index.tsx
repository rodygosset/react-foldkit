import { createFileRoute } from "@tanstack/react-router"
import { ExampleGrid } from "../../site/components/example-grid"

export const Route = createFileRoute("/examples/")({
	head: () => ({
		meta: [
			{ title: "Examples · react-foldkit" },
			{ name: "description", content: "React apps whose state lives in Foldkit Programs, with their source." },
		],
	}),
	component: ExamplesPage,
})

function ExamplesPage() {
	return (
		<main className="mx-auto w-full max-w-[1120px] px-4 py-14 sm:px-6 lg:py-20">
			<h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Examples</h1>
			<p className="mt-3 max-w-2xl text-lg text-muted-foreground">
				Each example is a React app whose state lives in a Foldkit Program. Open one to try it, and read its
				source next to it.
			</p>
			<ExampleGrid />
		</main>
	)
}
