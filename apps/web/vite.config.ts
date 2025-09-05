import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "child_process";

let BRANCH = "unknown", COMMIT = "unknown";
try {
  BRANCH = execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
  COMMIT = execSync("git rev-parse --short HEAD").toString().trim();
} catch {}

const API = "http://127.0.0.1:8000";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __WEB_BRANCH__: JSON.stringify(BRANCH),
    __WEB_COMMIT__: JSON.stringify(COMMIT),
  },
  resolve: {
    alias: {
      // ✅ force lowercase import resolution
      Recharts: "recharts",
    },
  },
  server: {
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
});
