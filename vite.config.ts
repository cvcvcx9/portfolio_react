import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  server: { port: 5173, host: '127.0.0.1' },
  preview: { port: 4173, host: '127.0.0.1' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html'), cases: resolve(__dirname, 'cases/index.html'), play: resolve(__dirname, 'play/index.html') },
    },
  },
})
