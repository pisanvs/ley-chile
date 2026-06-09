import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import path from 'node:path'

const BASE = process.env.VITE_BASE ?? '/ley-chile/'

export default defineConfig({
  base: BASE,
  plugins: [TanStackRouterVite(), react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
})
