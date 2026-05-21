import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  esbuild: {
    drop: ['console', 'debugger'],
  },
  build: {
    target: 'es2020',
    minify: 'esbuild',
    cssCodeSplit: true,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          if (id.includes('/recharts/') || id.includes('/d3-') || id.includes('/victory-vendor/')) {
            return 'vendor-recharts';
          }
          if (id.includes('/html-to-image/')) return 'vendor-export';
          if (id.includes('/@supabase/')) return 'vendor-supabase';
          if (id.includes('/lucide-react/')) return 'vendor-icons';
          if (id.includes('/@react-oauth/')) return 'vendor-oauth';
          if (
            id.includes('/react-router-dom/') ||
            id.includes('/react-router/') ||
            id.includes('/@remix-run/router/') ||
            id.includes('/react-dom/') ||
            id.includes('/react/')
          ) {
            return 'vendor-framework';
          }
        },
      },
    },
  },
})
