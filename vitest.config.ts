import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["__tests__/**/*.test.ts"],
        environment: "node",
        globals: false,
        pool: "forks",
        coverage: {
            provider: "v8",
            reporter: ["text", "json"],
            include: ["src/**/*.ts"],
        },
    },
});
