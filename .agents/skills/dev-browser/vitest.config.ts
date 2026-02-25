import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 60_000, // Playwright tests can be slow
    hookTimeout: 60_000,
    teardownTimeout: 60_000,
  },
})
