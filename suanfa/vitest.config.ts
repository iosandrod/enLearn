import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@suanfa/kernel": `${root}packages/kernel/src/index.ts`,
      "@suanfa/model": `${root}packages/model/src/index.ts`,
      "@suanfa/timeline": `${root}packages/timeline/src/index.ts`,
      "@suanfa/transaction": `${root}packages/transaction/src/index.ts`,
      "@suanfa/graph": `${root}packages/graph/src/index.ts`,
      "@suanfa/fixture": `${root}packages/fixture/src/index.ts`,
      "@suanfa/compatibility": `${root}packages/compatibility/src/index.ts`,
      "@suanfa/forecast": `${root}packages/forecast/src/index.ts`,
      "@suanfa/mrp": `${root}packages/mrp/src/index.ts`
    }
  },
  test: {
    environment: "node",
    include: ["packages/*/test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      reporter: ["text", "html", "json-summary"]
    }
  }
});
