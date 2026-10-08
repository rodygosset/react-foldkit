import { defineConfig } from "vitest/config"

export default defineConfig({
	test: {
		environment: "happy-dom",
		setupFiles: ["./vitest.setup.ts"],
		include: ["src/**/*.test.ts", "src/**/*.test.tsx", "test/integration/**/*.test.tsx"],
		coverage: {
			thresholds: {
				"src/store/store.ts": { branches: 85, lines: 95 },
				"src/react/providerSession.ts": { branches: 90, lines: 95 },
				"src/commitSource/connection.ts": { branches: 80, lines: 95 },
				"src/loader/loader.ts": { branches: 90, lines: 95 },
			},
			provider: "v8",
			reporter: ["text", "html", "json-summary"],
			include: ["src/**/*.ts", "src/**/*.tsx"],
			exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/*.d.ts", "vitest.setup.ts", "vitest.config.ts"],
		},
	},
})
