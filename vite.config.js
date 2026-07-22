import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { Buffer } from 'node:buffer'
import https from 'https'
import http from 'http'

// Plugin simples para simular as Serverless Functions da Vercel localmente no Vite
const vercelApiMockPlugin = () => ({
  name: 'vercel-api-mock',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url.startsWith('/api/')) return next()
      
      try {
        const urlObj = new URL(req.url, `http://${req.headers.host}`)
        const targetUrl = urlObj.searchParams.get('url')
        if (!targetUrl) {
          res.statusCode = 400
          return res.end(JSON.stringify({ error: 'url obrigatoria' }))
        }

        const client = targetUrl.startsWith('https') ? https : http
        client.get(targetUrl, {
          headers: {
            'Accept': 'image/*,*/*;q=0.8',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        }, (proxyRes) => {
          if (proxyRes.statusCode !== 200) {
            res.statusCode = proxyRes.statusCode
            return res.end(JSON.stringify({ error: 'Falha no fetch local' }))
          }

          const contentType = proxyRes.headers['content-type'] || 'image/png'
          const chunks = []
          proxyRes.on('data', chunk => chunks.push(chunk))
          proxyRes.on('end', () => {
            const buffer = Buffer.concat(chunks)
            if (req.url.startsWith('/api/logo-base64')) {
              const base64 = buffer.toString('base64')
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ dataUrl: `data:${contentType};base64,${base64}` }))
            } else {
              res.setHeader('Content-Type', contentType)
              res.end(buffer)
            }
          })
        }).on('error', err => {
          res.statusCode = 500
          res.end(JSON.stringify({ error: err.message }))
        })
      } catch (err) {
        res.statusCode = 500
        res.end(JSON.stringify({ error: err.message }))
      }
    })
  }
})

export default defineConfig({
  plugins: [react(), tailwindcss(), vercelApiMockPlugin()],
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
