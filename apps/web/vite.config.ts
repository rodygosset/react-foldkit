import tailwindcss from "@tailwindcss/vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { content } from "./plugins/content.ts"

const config = defineConfig({
	resolve: { tsconfigPaths: true },
	plugins: [
		devtools(),
		content(),
		tailwindcss(),
		tanstackStart({
			prerender: {
				enabled: true,
				crawlLinks: true,
				failOnError: true,
				// Each page renders once. The prerenderer appends a slash to the path, which breaks queries and hashes.
				filter: (page) => !/[?#]/.test(page.path),
			},
			pages: [{ path: "/" }, { path: "/docs" }],
		}),
		viteReact(),
	],
})

export default config
