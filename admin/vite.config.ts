import { createRequire } from "node:module";
import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

const require = createRequire(import.meta.url);
const { seedData } = require("../cloudfunctions/seed-data.cjs");

export default defineConfig({
  base: "./",
  plugins: [
    vue(),
    {
      name: "shop-seed",
      resolveId(id) {
        if (id === "virtual:shop-seed") return "\0virtual:shop-seed";
      },
      load(id) {
        if (id === "\0virtual:shop-seed")
          return `export default ${JSON.stringify(seedData())}`;
      },
    },
  ],
  server: { host: "localhost", port: 5173, strictPort: true },
  preview: { host: "localhost", port: 5173, strictPort: true },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
