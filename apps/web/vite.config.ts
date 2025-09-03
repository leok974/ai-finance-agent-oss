import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    base: '/app/',
    server: { port: 5173, host: true, open: '/app/' },
    define: { __API_BASE__: JSON.stringify(env.VITE_API_BASE || 'http://127.0.0.1:8000') }
  }
})
