import path from "path"
import { fileURLToPath } from "url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// __dirname isn't defined in ESM; derive it from import.meta.url.
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split large third-party libs into their own cacheable chunks so the main
        // app bundle is smaller and vendor code isn't re-downloaded on every app change.
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-syntax": ["react-syntax-highlighter"],
          "vendor-markdown": ["react-markdown", "remark-gfm"],
          "vendor-analytics": ["posthog-js"],
        },
      },
    },
  },
})