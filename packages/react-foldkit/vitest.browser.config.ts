import { playwright } from "@vitest/browser-playwright"
import { defineConfig } from "vitest/config"

export default defineConfig({
	cacheDir: "node_modules/.vite/reactFoldkitBrowser",
	optimizeDeps: {
		include: [
			"foldkit/subscription",
			"react",
			"react-dom/client",
			"react/jsx-runtime",
			"use-sync-external-store/shim/with-selector",
		],
	},
	test: {
		include: ["test/browser/**/*.test.tsx"],
		setupFiles: ["./vitest.setup.ts"],
		browser: {
			enabled: true,
			headless: true,
			provider: playwright(),
			instances: [{ browser: "chromium" }],
		},
	},
})
