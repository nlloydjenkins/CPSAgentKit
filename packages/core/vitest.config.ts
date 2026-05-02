import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: ".",
    include: ["src/__tests__/**/*.test.ts"],
    alias: {
      // Resolve .js imports to .ts source files during testing
      "^(\\.\\.?\\/.*)\\.js$": "$1.ts",
    },
  },
});
