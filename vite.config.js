/* global process */
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import legacy from '@vitejs/plugin-legacy'
import postcss from 'postcss'
import cascadeLayers from '@csstools/postcss-cascade-layers'
import oklabFunction from '@csstools/postcss-oklab-function'
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
// O Tailwind v4 envolve tudo em @layer e usa oklch() na paleta; nada disso existe
// no Safari 12 (iPad Air 1 / iOS 12), que descarta a folha inteira e deixa a tela
// preta. Em vez de degradar o CSS de todo mundo — achatar camadas custa ~10 mil
// hacks de especificidade e quase dobra o arquivo — geramos uma SEGUNDA folha com
// os equivalentes antigos e só os navegadores sem @layer a baixam.
const legacyCssPlugin = () => ({
  name: 'legacy-css-fallback',
  apply: 'build',
  enforce: 'post',
  async generateBundle(_options, bundle) {
    const cssAssets = Object.values(bundle).filter(
      (asset) => asset.type === 'asset' && asset.fileName.endsWith('.css')
    )
    if (cssAssets.length === 0) return

    const processor = postcss([
      cascadeLayers(),
      oklabFunction({ preserve: false, subFeatures: { displayP3: false } }),
    ])

    const legacyFiles = []
    for (const asset of cssAssets) {
      const result = await processor.process(String(asset.source), { from: undefined })
      const fileName = asset.fileName.replace(/\.css$/, '.legacy.css')
      this.emitFile({ type: 'asset', fileName, source: result.css })
      legacyFiles.push(fileName)
    }

    const html = Object.values(bundle).find(
      (asset) => asset.type === 'asset' && asset.fileName === 'index.html'
    )
    if (!html) return

    // CSSLayerBlockRule existe a partir do Safari 15.4/Chrome 99. Onde não existe,
    // @layer também não — é a checagem exata do que quebra.
    const loader = `<script>(function(){if(typeof window.CSSLayerBlockRule!=="undefined")return;`
      + `var f=${JSON.stringify(legacyFiles)};for(var i=0;i<f.length;i++){`
      + `var l=document.createElement("link");l.rel="stylesheet";l.href="/"+f[i];`
      + `document.head.appendChild(l);}})();</script>`
    html.source = String(html.source).replace('</head>', `${loader}</head>`)
  },
})

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
    plugins: [
      react(),
      tailwindcss(),
      vercelApiDevPlugin(),
      legacyCssPlugin(),
      // Bundle extra só para navegadores antigos (iPad Air 1 / iOS 12 = Safari 12).
      // Navegadores modernos carregam o bundle `module` e ignoram este por completo.
      legacy({
        targets: ['safari >= 12', 'ios_saf >= 12'],
        modernPolyfills: false,
        renderLegacyChunks: true,
      }),
    ],
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
