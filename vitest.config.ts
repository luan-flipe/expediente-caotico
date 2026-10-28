import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/test/**/*.test.ts", "apps/server/src/test/**/*.test.ts", "apps/web/src/**/*.test.ts", "apps/mobile/src/test/**/*.test.ts"],
  },
});
