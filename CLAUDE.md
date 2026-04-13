# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Marketing analytics dashboard for Brazilian digital agencies (Vilas Growth Marketing, Grupo Tag). Integrates Meta Ads, Google Sheets, and Supabase for real-time campaign monitoring, alerting, and reporting. All UI text is in **Portuguese (pt-BR)**, currency is **BRL (R$)**.

## Commands

```bash
npm run dev       # Start Vite dev server with HMR
npm run build     # Production build
npm run lint      # ESLint check
npm run preview   # Preview production build locally
```

## Architecture

**Stack:** React 19 + Vite 7 + Tailwind CSS 4 + Supabase + recharts

### State Management

Seven React Context providers wrap the app (defined in `src/contexts/`):

- **AuthContext** — Email/password login + Google/Meta OAuth. Session in localStorage (`vilasmkt_auth`).
- **MetaAdsContext** — Accounts, campaigns, balances from Meta Graph API v22.0. Refreshes on mount, period change, and custom DOM events (`meta-token-updated`, `meta-accounts-toggled`).
- **AgencyContext** — Agency-to-account mappings (localStorage).
- **AlertsContext** — Real-time alerts derived from MetaAds + balance data.
- **ChecklistContext** — Daily tasks (Supabase primary, localStorage fallback).
- **ChangeLogContext** — Activity history (Supabase).
- **ClientsContext** — Client data parsed from public Google Sheets CSV.

### Routing

React Router v7 with lazy-loaded modules (`React.lazy()` + `Suspense`). Protected routes use `<PrivateRoute>` inside `<AppLayout>` (sidebar + content area). 17 feature modules in `src/modules/`.

### Services (`src/services/`)

- **metaApi.js** — Meta Graph API client. Token priority: localStorage OAuth token > `VITE_META_ACCESS_TOKEN` env var. Handles insights, campaigns, ad sets, breakdowns (region, age, gender, platform).
- **supabase.js** — Supabase client init from `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.
- **googleSheets.js** — Parses CSV from a specific public Google Sheets spreadsheet (sheets: TAG, GDM, LAQUILA). Normalizes client status values.
- **campaignAnalysis.js** — Adaptive analytics engine with relative benchmarking, pattern detection, and anomaly scoring.

### Shared Utilities (`src/shared/`)

- **PeriodSelector** — Reusable date range picker with 8 presets (Today, Last 7d, Last 30d, Last Month, etc.)
- **dateUtils.js** — Period presets returning `{ startDate, endDate }` in YYYY-MM-DD format.
- **format.js** — BRL currency, number, percent, date/time formatting. Status color/label maps, cost/pacing calculations.

### Visual Reports (`src/modules/report-visual/`)

Exports dashboard cards as PNG using `html-to-image`. Logos are pre-converted to base64 data URLs before render. `toPng` is called twice (first as warm-up) to ensure images render in the cloned DOM.

## Environment Variables

```
VITE_GOOGLE_CLIENT_ID       # Google OAuth client ID
VITE_META_ACCESS_TOKEN      # Meta Graph API fallback token
VITE_META_APP_ID            # Meta app ID
VITE_SUPABASE_URL           # Supabase project URL
VITE_SUPABASE_ANON_KEY      # Supabase anonymous key
VITE_AUTH_EMAIL              # Legacy auth email (temporary)
VITE_AUTH_PASS               # Legacy auth password (temporary)
```

## Tailwind Theme

Defined in `src/index.css` using Tailwind v4 `@theme` syntax (no separate config file):

- Primary: `#0FA5AE` → `#20CFCF`
- Background: `#0A0C11` (dark)
- Platform colors: Meta `#1877F2`, Google `#34A853`
- Semantic: success `#2DD4A8`, warning `#F5A623`, danger `#F25757`

## Agency System

Two agencies supported: `vilasmkt` (Vilas Growth Marketing) and `tag` (Grupo Tag). Agency detection is name-based (`matchAgency()` helpers). Each agency has its own logo and branding in reports. Accounts are filtered by agency assignment.

## Database

Supabase PostgreSQL with RLS. Key tables: `users`, `user_tokens`, `ad_accounts`, `checklist_items`, `change_log`. Schema in `supabase/schema.sql`, migrations in `supabase/migrations/`.

# Cost Reducer Skill

## Objetivo
Analisar e reduzir custos de infraestrutura, serviços e código. Identifica gargalos financeiros e propõe otimizações concretas com estimativa de economia.

## Quando usar
- Revisar stack de infra antes de escalar
- Auditar uso de APIs pagas
- Identificar recursos subutilizados em cloud
- Revisar código que gera custo desnecessário (queries N+1, chamadas redundantes, etc.)

## Como executar
1. Solicite ao usuário o contexto: cloud provider, serviços em uso, volume de requisições/mês e custo atual aproximado
2. Leia os arquivos relevantes: `cloud-and-infra.md`, `code-level-savings.md`, `services-and-finops.md`
3. Mapeie cada ponto de custo identificado
4. Para cada ponto, apresente: problema, impacto estimado em $ e solução proposta
5. Priorize por ROI (maior economia com menor esforço primeiro)

## Output esperado
Relatório estruturado com:
- Resumo executivo (economia total estimada)
- Lista priorizada de otimizações
- Passos de implementação por item

claude config set permissions.allow '["Bash","Read","Edit","Write","WebFetch","Grep","Glob","NotebookEdit","WebSearch"]'

# Researcher Skill

## Objetivo
Conduzir pesquisas aprofundadas sobre qualquer tema, sintetizando informações de múltiplas fontes em análises estruturadas e acionáveis.

## Quando usar
- Pesquisar concorrentes ou mercado antes de decisão de produto
- Investigar tecnologia ou biblioteca antes de adotar
- Analisar tendências de uma área
- Produzir briefing sobre qualquer tema para tomada de decisão

## Como executar

### Fase 1: Escopo
1. Defina a pergunta central que precisa ser respondida
2. Identifique subtópicos relevantes (máximo 5)
3. Determine o nível de profundidade necessário (visão geral vs. análise técnica)

### Fase 2: Coleta
1. Busque fontes primárias quando possível (documentação oficial, papers, dados)
2. Use fontes secundárias para contexto e síntese
3. Identifique lacunas e controvérsias no tema

### Fase 3: Síntese
1. Separe fatos de opiniões
2. Identifique consensos e divergências
3. Conecte as informações com o contexto do usuário

### Fase 4: Output
1. Estruture por relevância para a decisão, não por ordem de descoberta
2. Inclua fontes para pontos críticos
3. Termine com recomendação ou próximos passos claros

## Output esperado
- Resumo executivo (3-5 pontos principais)
- Análise detalhada por subtópico
- Pontos de atenção e limitações da pesquisa
- Recomendação ou conclusão acionável

# Scalability Skill

## Objetivo
Avaliar e implementar estratégias de escalabilidade em sistemas de software. Cobre APIs, bancos de dados, filas, cache e infraestrutura.

## Quando usar
- Sistema começando a apresentar lentidão sob carga
- Preparar arquitetura para crescimento de 10x
- Revisar gargalos antes de campanha ou lançamento
- Planejar migração de monolito para serviços

## Como executar
1. Identifique o gargalo atual (CPU? DB? I/O? rede?)
2. Leia o arquivo correspondente ao gargalo identificado
3. Proponha solução com menor impacto de implementação primeiro
4. Documente limites atuais e projeção após otimização
5. Defina métricas de sucesso antes de implementar

## Arquivos de referência
- api-and-services.md: escalabilidade de APIs e microserviços
- caching-and-queues.md: estratégias de cache e filas assíncronas
- database-scaling.md: banco de dados sob alta carga
- infrastructure.md: infra, containers e auto-scaling

## Output esperado
- Diagnóstico do gargalo atual
- Plano de ação priorizado por impacto vs esforço
- Estimativa de capacidade após otimização

# Security Skill

## Objetivo
Identificar e corrigir vulnerabilidades de segurança em aplicações web, APIs, bancos de dados e infraestrutura.

## Quando usar
- Revisão de segurança antes de lançamento
- Investigação de incidente de segurança
- Auditoria de configurações de produção
- Implementação de autenticação e autorização

## Como executar
1. Identifique a superfície de ataque: web, API, banco, infra, desktop
2. Leia o arquivo correspondente à área de foco
3. Aplique o checklist de revisão
4. Documente cada vulnerabilidade com: severidade, impacto e remediação
5. Priorize por risco real (probabilidade x impacto)

## Arquivos de referência
- auth-and-secrets.md: autenticação, JWT, secrets e credenciais
- database-and-deps.md: banco de dados e dependências vulneráveis
- desktop-security.md: segurança em aplicações desktop/Electron
- web-security.md: OWASP Top 10 e vulnerabilidades web

## Severidade
- Crítica: exposição de dados de usuários ou acesso root ao sistema
- Alta: bypass de autenticação, SQL injection, XSS armazenado
- Média: CSRF, rate limiting ausente, logs com dados sensíveis
- Baixa: headers de segurança faltando, mensagens de erro verbosas

# Self-Healing Skill

## Objetivo
Fazer o Claude Code aprender com erros, criar novas skills automaticamente quando identifica padrões recorrentes e melhorar sua própria performance ao longo do tempo.

## Quando usar
- Após resolver um problema complexo que provavelmente vai se repetir
- Quando o Claude percebe que está usando o mesmo padrão em múltiplas situações
- Para criar documentação automaticamente de decisões técnicas tomadas

## Como executar

### Detectar padrão
1. Leia pattern-recognition.md para identificar se o problema atual é recorrente
2. Verifique se já existe skill para esse tipo de problema
3. Se não existe e o padrão é recorrente: crie a skill

### Criar skill automaticamente
1. Leia skill-creation-guide.md para o processo de criação
2. Extraia o aprendizado da sessão atual em formato de skill
3. Salve no diretório correto com nome descritivo

### Gerenciar memória
1. Leia memory-management.md para como persistir aprendizados
2. Documente decisões importantes para referência futura
3. Atualize skills existentes quando o aprendizado as contradiz

## Output esperado
- Nova skill criada quando padrão recorrente identificado
- Decisões técnicas documentadas automaticamente
- Melhoria progressiva: a segunda vez que o mesmo problema aparece, resolve mais rápido e melhor