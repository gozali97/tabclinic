import { defineConfig, loadEnv } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  const port = Number(env.DEV_PORT || 5173)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DEV_PORT must be a port between 1 and 65535')
  }
  return {
    plugins: [tailwindcss()],
    server: {
      host: env.DEV_HOST || '127.0.0.1',
      port,
      strictPort: true,
      watch: {
        usePolling: true,
        interval: 1000,
      },
      proxy: {
        '/api': { target: env.API_PROXY_TARGET || 'http://127.0.0.1:8071' },
      },
    },
  }
})
