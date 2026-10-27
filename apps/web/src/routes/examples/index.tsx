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
		<main className="mx-auto w-full max-w-[1120px] px-5 pt-36 pb-24 sm:px-6">
			<h1 className="text-[clamp(2.5rem,6vw,4rem)] leading-none font-semibold tracking-[-0.045em]">Examples</h1>
			<p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
				Each example is a React app whose state lives in a Foldkit Program. Open one to try it, and read its
				source next to it.
			</p>
			<ExampleGrid />
		</main>
	)
}
