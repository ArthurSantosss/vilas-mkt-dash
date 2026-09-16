/* global process */
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import fs from 'node:fs'

// Lê o corpo da requisição (para POST/PUT/PATCH/DELETE).
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => { data += chunk })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

// Plugin de dev: executa as Serverless Functions REAIS da pasta `api/` localmente,
// adaptando a interface do Node http para a interface estilo Vercel (req.query,
// req.body, res.status().json()). Assim login, meta-proxy, o assistente etc.
// funcionam no `vite dev` sem precisar do `vercel dev`.
const vercelApiDevPlugin = () => ({
  name: 'vercel-api-dev',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url.startsWith('/api/')) return next()

      // Adapta `res` para o estilo Vercel.
      res.status = (code) => { res.statusCode = code; return res }
      res.json = (obj) => {
        if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(obj))
        return res
      }
      res.send = (data) => { res.end(data); return res }

      try {
        const urlObj = new URL(req.url, `http://${req.headers.host}`)
        const routePath = urlObj.pathname.replace(/^\/api\//, '').replace(/\/+$/, '')

        // Resolve o arquivo handler: api/<rota>.js ou api/<rota>/index.js
        const candidates = [
          path.resolve('api', `${routePath}.js`),
          path.resolve('api', routePath, 'index.js'),
        ]
        const file = candidates.find((f) => fs.existsSync(f))
        if (!file) {
          res.statusCode = 404
          return res.end(JSON.stringify({ error: `Função /api/${routePath} não encontrada (dev).` }))
        }

        // Query params estilo Vercel.
        req.query = Object.fromEntries(urlObj.searchParams.entries())

        // Body para métodos com corpo.
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
          const raw = await readBody(req)
          const contentType = req.headers['content-type'] || ''
          req.body = contentType.includes('application/json') && raw ? JSON.parse(raw) : raw
        }

        const mod = await server.ssrLoadModule(file)
        const handler = mod.default
        if (typeof handler !== 'function') {
          res.statusCode = 500
          return res.end(JSON.stringify({ error: `Handler inválido em /api/${routePath}.` }))
        }

        await handler(req, res)
        if (!res.writableEnded) res.end()
      } catch (err) {
        server.config.logger.error(`[api-dev] ${req.url}: ${err.message}`)
        if (!res.writableEnded) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: err.message }))
        }
      }
    })
  },
})

export default defineConfig(({ mode }) => {
  // Carrega TODAS as vars do .env (prefixo '' inclui as não-VITE) no processo do
  // Vite, para os handlers de api/ acessarem via process.env sem sobrescrever o que
  // já vier do ambiente do sistema.
  const env = loadEnv(mode, process.cwd(), '')
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) process.env[key] = value
  }

  return {
    plugins: [react(), tailwindcss(), vercelApiDevPlugin()],
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
            // Só é baixado ao abrir a aba de relatório em PDF (rota lazy).
            if (id.includes('/@react-pdf/') || id.includes('/yoga-layout')) return 'vendor-pdf';
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
  }
})
