import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/storage-hunters-gear-optimizer/' : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Storage Hunters Optimiser',
        short_name: 'SH Optimiser',
        description: 'Offline gear, certificate, vehicle and Gavel Trophy optimiser for Storage Hunters: Open World.',
        theme_color: '#10121a',
        background_color: '#10121a',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/storage-hunters-gear-optimizer/',
        start_url: '/storage-hunters-gear-optimizer/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,png,svg,ico,json}']
      }
    })
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
}));
