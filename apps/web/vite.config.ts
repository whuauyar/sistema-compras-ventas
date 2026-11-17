import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    rollupOptions: {
      output: {
        // Librerías en bloques propios: cambian poco y quedan en caché del navegador
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          datos: ['@tanstack/react-query', 'react-hook-form', 'zod', '@hookform/resolvers'],
        },
      },
    },
  },
  server: {
    // En desarrollo el frontend llama a /api y Vite lo reenvía al backend Adonis
    proxy: { '/api': 'http://localhost:3333' },
  },
})
