import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Next's tsconfig uses jsx:"preserve", which esbuild can't execute — use
  // the automatic runtime so .tsx tests (e.g. PDF components) run.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
});
