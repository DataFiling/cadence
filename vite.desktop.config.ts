import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const root = resolve("desktop");

export default defineConfig({
  root,
  base: "./",
  publicDir: resolve("public"),
  envDir: resolve("."),
  plugins: [tailwindcss(), react()],
  resolve: {
    tsconfigPaths: true,
    alias: { "@": resolve("src") },
  },
  build: {
    outDir: resolve("desktop-dist"),
    emptyOutDir: true,
  },
});
