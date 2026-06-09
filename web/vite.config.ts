import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const BASE = process.env.VITE_BASE ?? '/ley-chile/'

export default defineConfig({
  base: BASE,
  plugins: [
    TanStackRouterVite({
      routesDirectory: path.resolve(here, './src/routes'),
      generatedRouteTree: path.resolve(here, './src/routeTree.gen.ts'),
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { '@': path.resolve(here, './src') },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
})
