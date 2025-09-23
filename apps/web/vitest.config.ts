import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  define: {
    'import.meta.env.VITE_ENABLE_AGUI': JSON.stringify('1'),
    'import.meta.env.VITE_API_BASE': JSON.stringify(''),
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/test/setupTests.ts', './src/__tests__/setup.fetch-mock.ts'],
    globals: true,
    clearMocks: true,
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
