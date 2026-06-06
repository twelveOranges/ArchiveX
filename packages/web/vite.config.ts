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
      onwarn(warning, handler) {
        // Suppress unused export and non-interactive element warnings
        if (warning.code === "a11y-no-noninteractive-element-interactions") return;
        if (warning.message?.includes("unused export property")) return;
        handler(warning);
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
