import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import postcssPresetEnv from "postcss-preset-env";
import { resolve } from "path";

export default defineConfig(() => ({
  base: "/",

  plugins: [
    TanStackRouterVite({ target: "react" }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],

  resolve: {
    alias: {
      "@/gotypes": resolve(__dirname, "codegen/gotypes.gen.ts"),
      "@": resolve(__dirname, "src"),
      "micromark-extension-math": "micromark-extension-llm-math",
    },
  },

  css: {
    postcss: {
      plugins: [
        postcssPresetEnv({
          stage: 1,
          browsers: ["Safari >= 14"],
          features: {
            "custom-properties": true,
            "nesting-rules": true,
            "logical-properties-and-values": true,
            "media-query-ranges": true,
            "color-function": true,
            "double-position-gradients": true,
            "gap-properties": true,
            "place-properties": true,
            "overflow-property": true,
            "focus-visible-pseudo-class": true,
            "focus-within-pseudo-class": true,
            "any-link-pseudo-class": true,
            "not-pseudo-class": true,
            "dir-pseudo-class": true,
            "all-property": true,
            "image-set-function": true,
            "hwb-function": true,
            "lab-function": true,
            "oklab-function": true,
          },
        }),
      ],
    },
  },

  build: {
    target: "es2017",
    outDir: "dist",
    sourcemap: false,
  },

  server: {
    port: 5173,
  },

  esbuild: {
    target: "es2017",
  },
}));