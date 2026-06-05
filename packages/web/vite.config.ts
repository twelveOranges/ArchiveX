import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import sveltePreprocess from "svelte-preprocess";
import { resolve } from "path";

export default defineConfig({
  plugins: [
    svelte({
      preprocess: sveltePreprocess(),
      compilerOptions: {
        css: "injected",
      },
    }),
  ],
  resolve: {
    alias: {
      "@archivex/core": resolve(__dirname, "../core/src/index.ts"),
      "@archivex/ui": resolve(__dirname, "../ui/src/index.ts"),
    },
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
  },
});
