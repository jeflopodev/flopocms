import { defineConfig } from "vitest/config";

/**
 * Block unit tests run in plain Node against the modules directly.
 * Nothing here touches the network, a database, or Astro, so no aliases
 * or virtual-module stubs are needed.
 */
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "#": fileURLToPath(new URL("./src", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
