import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'brand-official-guidelines.png', 'brand-guidelines-dark.png', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'TerraTurn — 20 years of NASA data, one planting decision',
        short_name: 'TerraTurn',
        description: 'Compare crop rotation strategies for your farm using NASA satellite data',
        start_url: '/app',
        scope: '/',
        display: 'standalone',
        background_color: '#F2EDE4',
        theme_color: '#1C2B22',
        lang: 'en',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
        // Somente shell estático; nunca armazenar respostas privadas da API em cache.
        globPatterns: ['**/*.{js,css,html,svg,woff2,png}'],
        runtimeCaching: []
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/@react-three/') || id.includes('/three/')) return 'three-vendor'
          if (id.includes('/maplibre-gl/')) return 'maplibre-vendor'
          if (id.includes('/recharts/') || id.includes('/d3-')) return 'charts-vendor'
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) return 'react-vendor'
        }
      }
    }
  },
  server: { proxy: { '/api': { target: process.env.API_PROXY_TARGET || 'http://localhost:8000', changeOrigin: true } } }
})
