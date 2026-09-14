import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: resolve(__dirname),
  build: {
    outDir: resolve(__dirname, "../dist/demo"),
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    fs: {
      allow: [".."],
    },
  },
});
