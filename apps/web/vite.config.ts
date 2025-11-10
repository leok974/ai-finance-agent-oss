import { defineConfig, splitVendorChunkPlugin, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "child_process";
import path from "path";

// Prefer injected environment variables (Docker build) before attempting local git commands.
const envBranch = process.env.VITE_GIT_BRANCH ?? process.env.WEB_BRANCH;
const envCommit = process.env.VITE_GIT_COMMIT ?? process.env.WEB_COMMIT;
let BRANCH = envBranch || "unknown";
let COMMIT = envCommit || "unknown";
const BUILD_ID = process.env.WEB_BUILD_ID || "unknown";

if (BRANCH === "unknown" || COMMIT === "unknown") {
  try {
    if (BRANCH === "unknown") BRANCH = execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
    if (COMMIT === "unknown") COMMIT = execSync("git rev-parse --short HEAD").toString().trim();
  } catch (error) {
    // ignore git metadata lookup failures in minimal environments
  }
}

// During local E2E we sometimes run backend on 8001 with encryption disabled.
// Prefer 8001 if BACKEND_PORT is set; else default to 8000.
const API = `http://127.0.0.1:${process.env.BACKEND_PORT || '8000'}`;

/**
 * Plugin to inject prelude script tag into chat HTML
 * The prelude is a separate entry point that MUST load before the main chat bundle
 */
function injectPreludeScript(): Plugin {
  return {
    name: 'inject-prelude-script',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        // Only apply to chat/index.html
        if (!ctx.path.includes('chat/index.html')) return html;

        // Find the prelude bundle filename from the bundle
        const preludeChunk = Object.values(ctx.bundle || {}).find(
          (chunk: any) => chunk.name === 'chat-prelude'
        );

        if (!preludeChunk || !('fileName' in preludeChunk)) {
          console.warn('[inject-prelude] prelude chunk not found in bundle');
          return html;
        }

        const preludeFile = `/${preludeChunk.fileName}`;

        // Inject prelude script tag BEFORE the first existing script tag
        return html.replace(
          /<script type="module"/,
          `<script type="module" crossorigin src="${preludeFile}"></script>\n  <script type="module"`
        );
      }
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), splitVendorChunkPlugin(), injectPreludeScript()],
  define: {
    __WEB_BRANCH__: JSON.stringify(BRANCH),
    __WEB_COMMIT__: JSON.stringify(COMMIT),
    __WEB_BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // ✅ Force lowercase import resolution
      Recharts: "recharts",
      // ✅ Guarantee single React copy (prevent duplicate bundles from dependencies)
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      'react-dom/client': path.resolve(__dirname, 'node_modules/react-dom/client'),
    },
    // ✅ Ensure a single copy of React in the bundle and during HMR
    dedupe: ['react', 'react-dom', 'react-dom/client'],
  },
  optimizeDeps: {
    // ✅ Pre-bundling also dedupes React (critical for dev server)
    include: ['react', 'react-dom', 'react-dom/client'],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
  server: {
    host: "127.0.0.1",
    proxy: {
      // All API requests go through /api prefix, Vite strips it before forwarding to FastAPI
      '/api': {
        target: API,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''), // FastAPI sees bare paths
      },
      // Safety net: direct /agent calls also proxy to backend (in case some slip through)
      '/agent': {
        target: API,
        changeOrigin: true,
        secure: false,
      },
      // Safety net: direct /auth calls proxy to backend (optional fallback)
      '/auth': {
        target: API,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    modulePreload: {
      polyfill: false,
    },
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        chat: path.resolve(__dirname, 'chat/index.html'),
        // Separate entry for prelude - must load before chat
        'chat-prelude': path.resolve(__dirname, 'src/chat/prelude.ts'),
      },
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
