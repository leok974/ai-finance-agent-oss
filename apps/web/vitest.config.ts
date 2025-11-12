import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import path from 'path'

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  resolve: {
    alias: [
      // Chat-only test pathing for shims
      { find: /^@chat\/react-dom-shim$/, replacement: path.resolve(__dirname, 'src/chat/react-dom-shim.ts') },
      { find: /^@chat\/radix-portal-shim$/, replacement: path.resolve(__dirname, 'src/chat/radix-portal-shim.tsx') },
      // Private react-dom-real alias used by the shim
      { find: /^react-dom-real$/, replacement: path.resolve(__dirname, 'node_modules/react-dom/index.js') },
    ],
    dedupe: ['react', 'react-dom'],
  },
  define: {
    'import.meta.env.VITE_ENABLE_AGUI': JSON.stringify('1'),
    'import.meta.env.VITE_API_BASE': JSON.stringify(''),
    'import.meta.env.BUILD_CHAT': JSON.stringify('1'),
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts', './src/test/setupTests.ts', './src/__tests__/setup.fetch-mock.ts', './tests/vitest.setup.ts'],
    globals: true,
    clearMocks: true,
    // Narrow what we actively collect so third‑party package internal tests (msw, etc.) are never included.
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'tests/unit/**/*.{test,spec}.{ts,tsx}',
    ],
    // Start from Vitest's default excludes, then add project‑specific ones.
    exclude: [
      ...configDefaults.exclude,
      'tests/e2e/**', // Playwright tests (handled separately by Playwright)
      'playwright.config.*',
      '**/node_modules/**/msw/**', // any path segment containing msw within node_modules
      '**/.pnpm/**/msw/**',        // pnpm store layout (defensive)
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: [
        // Core AG-UI & actively shipped components
        'src/components/ChatDock.tsx',
        'src/components/ExplainSignalDrawer.tsx',
        'src/components/ForecastCard.tsx',
        'src/components/QuickChips.tsx',
        'src/components/Help*.tsx',
        // Stream + libs + app state
        'src/lib/aguiStream.ts',
        'src/lib/name.ts',
        'src/lib/prettyToolName.ts',
        'src/context/**/*.{ts,tsx}',
        'src/selectors/**/*.{ts,tsx}',
        'src/state/chat/**/*.{ts,tsx}',
        // Only the util(s) we actually touch
        'src/utils/chatStore.ts',
      ],
      exclude: [
        'src/pages/**',
        'src/components/**/**Panel.{ts,tsx}',
        'src/components/**/Rule*.{ts,tsx}',
        'src/components/**/**Dialog.{ts,tsx}',
        'src/components/**/Agent*Renderer*.{ts,tsx}',
        'src/components/**/AgentChat*.{ts,tsx}',
        'src/tools/**',
        'src/runner/**',
        'src/**/*.stories.{ts,tsx}',
        'src/**/__mocks__/**',
        'src/**/__fixtures__/**',
        'src/test/**',
        '**/*.d.ts',
      ],
      thresholds: { lines: 45, functions: 45, branches: 45, statements: 45 },
    },
  },
})
