import { defineConfig } from "vitest/config";

/**
 * Block unit tests run in plain Node against the modules directly.
 * Nothing here touches the network, a database, or Astro, so no aliases
 * or virtual-module stubs are needed.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
