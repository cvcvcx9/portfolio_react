import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  server: { port: 5173, host: '127.0.0.1' },
  preview: { port: 4173, host: '127.0.0.1' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        cases: resolve(import.meta.dirname, 'cases/index.html'),
        play: resolve(import.meta.dirname, 'play/index.html'),
      },
    },
  },
})
