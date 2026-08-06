import { defineConfig } from "vitest/config"

export default defineConfig({
	test: {
		environment: "happy-dom",
		setupFiles: ["./vitest.setup.ts"],
		include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
		coverage: {
			provider: "v8",
			reporter: ["text", "html", "json-summary"],
			include: ["src/**/*.ts", "src/**/*.tsx"],
			exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/*.d.ts", "vitest.setup.ts", "vitest.config.ts"],
		},
	},
})
