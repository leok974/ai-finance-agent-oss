import { defineConfig, splitVendorChunkPlugin } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "child_process";
import path from "path";

let BRANCH = "unknown", COMMIT = "unknown";
try {
  BRANCH = execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
  COMMIT = execSync("git rev-parse --short HEAD").toString().trim();
} catch {}

const API = "http://127.0.0.1:8000";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), splitVendorChunkPlugin()],
  define: {
    __WEB_BRANCH__: JSON.stringify(BRANCH),
    __WEB_COMMIT__: JSON.stringify(COMMIT),
  },
  resolve: {
    alias: {
  '@': path.resolve(__dirname, './src'),
      // ✅ force lowercase import resolution
      Recharts: "recharts",
    },
  // Ensure a single copy of React in the bundle and during HMR
  dedupe: ["react", "react-dom"],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
  server: {
  host: "127.0.0.1",
    proxy: {
      // ✅ proxy ALL backend routes to FastAPI
      "/ingest": { target: API, changeOrigin: true },
      "/txns": { target: API, changeOrigin: true },
      "/rules": { target: API, changeOrigin: true },
      "/ml": { target: API, changeOrigin: true },
      "/report": { target: API, changeOrigin: true },
      "/budget": { target: API, changeOrigin: true },
      "/alerts": { target: API, changeOrigin: true },
      "/insights": { target: API, changeOrigin: true },
      "/agent": { target: API, changeOrigin: true },
      "/health": { target: API, changeOrigin: true },
      "/charts": { target: API, changeOrigin: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.match(/react|react-dom/)) return 'vendor-react';
            if (id.match(/lucide-react/)) return 'vendor-icons';
            if (id.includes('@tanstack')) return 'vendor-tanstack';
            if (id.match(/chart|recharts/i)) return 'vendor-charts';
            if (id.match(/@radix-ui/)) return 'vendor-radix';
            if (id.match(/remark-gfm|rehype|react-markdown/)) return 'vendor-markdown';
            if (id.match(/zod/)) return 'vendor-zod';
            if (id.match(/clsx|class-variance-authority|zustand/)) return 'vendor-utils';
            if (id.match(/vaul/)) return 'vendor-vaul';
            return 'vendor-misc';
          }
        }
      }
    }
  }
});
