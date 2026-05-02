import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: ".",
    include: ["src/__tests__/**/*.test.ts"],
    alias: {
      "^(\\.\\.?\\/.*)\\.js$": "$1.ts",
    },
  },
});
