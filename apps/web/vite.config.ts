import { defineConfig, loadEnv, splitVendorChunkPlugin, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import path from "path";

// Build metadata with git fallback
function git(cmd: string, fb = "unknown") {
  try {
    return execSync(cmd).toString().trim();
  } catch {
    return fb;
  }
}

const GIT_COMMIT = process.env.GITHUB_SHA || git("git rev-parse --short=12 HEAD");
const GIT_BRANCH = process.env.GITHUB_REF_NAME || git("git rev-parse --abbrev-ref HEAD");
const BUILD_TIME = new Date().toISOString();
const BUILD_ID = process.env.WEB_BUILD_ID || "unknown";

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

/**
 * Plugin to redirect UI component imports to iframe-aware versions for chat bundle
 * CRITICAL: This ensures chat uses components that portal to iframe's document, not parent window
 */
function chatIframeAliases(): Plugin {
  const chatPatchedAliases: Record<string, string> = {
    // Match the RESOLVED paths (after @ alias is applied)
    'src/components/ui/dropdown-menu': path.resolve(__dirname, 'src/chat/ui/dropdown-menu.tsx'),
    'src/components/ui/tooltip': path.resolve(__dirname, 'src/chat/ui/tooltip.tsx'),
    'src/components/ui/toast': path.resolve(__dirname, 'src/chat/ui/toast.tsx'),
    'src/components/ui/toaster': path.resolve(__dirname, 'src/chat/ui/toast.tsx'),
    'src/components/ui/popover': path.resolve(__dirname, 'src/chat/ui/popover.tsx'),
    'src/components/ui/portal': path.resolve(__dirname, 'src/chat/ui/Portal.tsx'),
    'src/lib/portal': path.resolve(__dirname, 'src/chat/portalRoot.ts'), // Block getPortalRoot usage
    'src/hooks/use-toast': path.resolve(__dirname, 'src/chat/hooks/use-toast.ts'),
  };

  // Track which modules are part of the chat bundle by following the dependency graph
  const chatModules = new Set<string>();
  const chatEntryPoints = [
    path.resolve(__dirname, 'src/chat/main.tsx'),
    path.resolve(__dirname, 'src/chat/prelude.ts'),
    path.resolve(__dirname, 'chat/index.html'),
  ];

  return {
    name: 'chat-iframe-aliases',
    enforce: 'pre',
    buildStart() {
      // Reset for each build
      chatModules.clear();
      chatEntryPoints.forEach(entry => chatModules.add(entry));
    },
    resolveId(source, importer) {
      // Check if the importer is part of the chat bundle or is ChatDock
      const isFromChat = importer && (
        chatModules.has(importer) ||
        importer.includes('/chat/') ||
        importer.includes('\\chat\\') ||
        importer.includes('ChatDock')
      );

      // Debug log for dropdown-menu specifically
      if (source.includes('dropdown-menu')) {
        console.log(`[resolve-dropdown] source=${source.slice(-50)} importer=${importer ? path.basename(importer) : 'NONE'} isFromChat=${isFromChat}`);
      }

      // ❌ DISABLED: react-dom aliasing creates module resolution issues
      // Using prelude.ts runtime patching instead
      // if (isFromChat && source === 'react-dom') {
      //   console.log(`[chat-alias] react-dom → react-dom-shim.ts (from ${path.basename(importer || 'unknown')})`);
      //   const shimPath = path.resolve(__dirname, 'src/chat/react-dom-shim.ts');
      //   chatModules.add(shimPath);
      //   return { id: shimPath };
      // }

      // ❌ DISABLED: Aliasing @radix-ui/react-portal breaks other Radix internals
      // if (isFromChat && source.startsWith('@radix-ui/react-portal')) {
      //   console.log(`[chat-alias] @radix-ui/react-portal → radix-portal-shim.tsx (from ${path.basename(importer || 'unknown')})`);
      //   const radixShimPath = path.resolve(__dirname, 'src/chat/radix-portal-shim.tsx');
      //   chatModules.add(radixShimPath);
      //   return { id: radixShimPath };
      // }

      if (isFromChat) {
        // Try to match against resolved paths
        for (const [pattern, replacement] of Object.entries(chatPatchedAliases)) {
          if (source.includes(pattern)) {
            console.log(`[chat-alias] ${source} → ${path.basename(replacement)} (from ${path.basename(importer || 'unknown')})`);
            // Mark the resolved module as part of chat bundle
            chatModules.add(replacement);
            return { id: replacement };
          }
        }
      }
      return null;
    },
    load(id) {
      // Track modules as we load them
      if (chatEntryPoints.some(entry => id.includes(entry.replace(/\\/g, '/')))) {
        chatModules.add(id);
      }
      if (id.includes('/chat/') || id.includes('\\chat\\') || id.includes('ChatDock')) {
        chatModules.add(id);
      }
      return null;
    },
    transform(_code, id) {
      // Track all modules loaded as part of chat bundle
      if (chatModules.has(id) ||
          id.includes('/chat/') || id.includes('\\chat\\') ||
          id.includes('/components/ChatDock')) {
        chatModules.add(id);
      }
      return null;
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const isChat = env.BUILD_CHAT === "1";
  console.log("[vite-config] BUILD_CHAT =", env.BUILD_CHAT, "isChat =", isChat);

  const runtimeBuildId = Date.now().toString();

  return {
    plugins: [react(), splitVendorChunkPlugin(), chatIframeAliases(), injectPreludeScript()],
    define: {
      __WEB_BRANCH__: JSON.stringify(GIT_BRANCH),
      __WEB_COMMIT__: JSON.stringify(GIT_COMMIT),
      __WEB_BUILD_ID__: JSON.stringify(BUILD_ID),
      __WEB_BUILD_TIME__: JSON.stringify(BUILD_TIME),
      __RUNTIME_BUILD_ID__: JSON.stringify(runtimeBuildId),
      "import.meta.env.BUILD_CHAT": JSON.stringify(env.BUILD_CHAT ?? "0"),
      "import.meta.env.VITE_CHAT_SAFE_MODE": JSON.stringify(env.VITE_CHAT_SAFE_MODE ?? "0"),
      "import.meta.env.VITE_DISABLE_OVERLAYS": JSON.stringify(env.VITE_DISABLE_OVERLAYS ?? "0"),
      "process.env.NODE_ENV": JSON.stringify(isChat ? "development" : "production"),
    },
    resolve: {
      alias: [
        // Standard @ alias for all builds
        { find: "@", replacement: path.resolve(__dirname, "./src") },

        // Chat-only aliases handled by chatIframeAliases plugin
        // (react-dom, @radix-ui/react-portal, component paths)

        // Common aliases for all builds
        { find: "Recharts", replacement: "recharts" },
        { find: "react", replacement: path.resolve(__dirname, "node_modules/react") },
      ],
      dedupe: ["react", "react-dom"],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "@radix-ui/react-portal",
        "@radix-ui/react-primitive",
        "@radix-ui/react-slot",
        "@radix-ui/react-dialog",
        "@radix-ui/react-dropdown-menu",
        "@radix-ui/react-tooltip",
        "@radix-ui/react-popover",
        "@radix-ui/react-toast",
        "@floating-ui/react-dom",
        "@floating-ui/dom",
        "@floating-ui/core",
        "@floating-ui/utils"
      ],
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      css: true,
    },
    server: {
      host: "127.0.0.1",
      proxy: {
        "/api": {
          target: API,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
        "/agent": {
          target: API,
          changeOrigin: true,
          secure: false,
        },
        "/auth": {
          target: API,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    build: {
      sourcemap: true,
      minify: "esbuild",
      modulePreload: {
        polyfill: false,
      },
      chunkSizeWarningLimit: 650,
      rollupOptions: {
        external: [], // ensure nothing accidentally externalizes react-dom
        input: {
          main: path.resolve(__dirname, "index.html"),
          chat: path.resolve(__dirname, "chat/index.html"),
          "chat-prelude": path.resolve(__dirname, "src/chat/prelude.ts"),
        },
        output: {
          manualChunks(id) {
            if (id.includes("node_modules")) {
              // Don't chunk our react-dom shim into vendor - it must stay in chat bundle
              if (id.includes("react-dom-shim")) return undefined;
              // React ecosystem (including react-is, prop-types) MUST be together
              if (id.match(/react|react-dom|react-is|prop-types|scheduler/)) return "vendor-react";
              if (id.match(/lucide-react/)) return "vendor-icons";
              if (id.includes("@tanstack")) return "vendor-tanstack";
              if (id.match(/chart|recharts/i)) return "vendor-charts";
              if (id.match(/@radix-ui/)) return "vendor-radix";
              if (id.match(/remark-gfm|rehype|react-markdown/)) return "vendor-markdown";
              if (id.match(/zod/)) return "vendor-zod";
              if (id.match(/clsx|class-variance-authority|zustand/)) return "vendor-utils";
              if (id.match(/vaul/)) return "vendor-vaul";
              return "vendor-misc";
            }
          },
        },
      },
    },
  };
});
