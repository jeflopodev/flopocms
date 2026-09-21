import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Unit tests run in plain Node against the modules directly, using the same
 * `#/*` and `@/*` path aliases the application code uses.
 */
export default defineConfig({
  resolve: {
    alias: {
      "#": fileURLToPath(new URL("./src", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // The Workers runtime provides this virtual module; tests get an empty stub.
      "cloudflare:workers": fileURLToPath(new URL("./test/cloudflare-workers-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
