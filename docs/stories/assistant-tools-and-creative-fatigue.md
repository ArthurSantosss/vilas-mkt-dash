# Assistente ampliado, troca de modelo e detecção de criativo cansado

## Status

InReview — implementado em 12/10/2026; falta configurar `ANTHROPIC_API_KEY` na Vercel e validar em preview.

## Pedido

Ampliar as ferramentas do assistente, trocar o modelo de IA (Claude Sonnet 5 como principal, Gemini como reserva) e implementar a detecção de criativo cansado na aba Meta Ads e no alerta diário do Slack.

## Critérios de aceite

- [x] O assistente usa `claude-sonnet-5` (sobrescrevível por `ANTHROPIC_MODEL`) quando `ANTHROPIC_API_KEY` existe; Gemini só entra sem chave Anthropic ou se o Claude falhar.
- [x] O assistente enxerga as mesmas contas Meta do painel (tokens de BM do registro + token de perfil) e usa o token da BM que cobre a conta em leituras e ações.
- [x] Novas leituras: `compare_periods`, `get_top_ads`, `get_change_log` (Meta/histórico) e `list_google_accounts`, `get_google_account_overview` (Google).
- [x] Novas escritas Google com confirmação e registro em `change_log`: `pause_google_campaign`, `activate_google_campaign`, `set_google_campaign_budget` (recusa orçamento compartilhado; teto de R$100k).
- [x] Detecção de fadiga: anúncios ativos, últimos 7 dias completos contra os 7 anteriores; frequência alta + queda do CTR de link; anúncios novos e de baixo volume são ignorados.
- [x] A aba Meta Ads mostra o painel de criativos cansados ao selecionar uma conta.
- [x] O briefing/alertas do Slack incluem o alerta `creative_fatigue` por conta; falha de consulta não vira "sem fadiga".

## Arquivos

- `src/shared/utils/creativeFatigue.js` (novo)
- `src/modules/meta-ads/CreativeFatiguePanel.jsx` (novo)
- `src/modules/meta-ads/index.jsx`
- `src/services/metaApi.js` (também remove duplicatas de `applyPeriodParams`/`getPreviousPeriodRange` que quebravam o carregamento do módulo)
- `src/shared/utils/automaticAlerts.js`
- `api/_briefing-data.js`
- `api/assistant-chat.js`
- `api/_assistant-tools.js`
- `api/_assistant-google-tools.js` (novo)
- `api/_assistant-write-tools.js`
- `api/google-ads-proxy.js` (exporta `readConnections`, `resolveAccountRoute`, `readWithAuthorizedRoutes`)
- `tests/creative-fatigue.test.js` (novo)
- `tests/period-sync.test.js` (importa os helpers de período de `metaPeriods.js`)

## Validação

- `npm test`: 83/83 passando.
- Projeto não tem script `typecheck`.

## Pendências de ativação

- Configurar `ANTHROPIC_API_KEY` na Vercel (hoje só existe `GEMINI_API_KEY` localmente).
- Ferramentas Google do assistente exigem `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_ADS_CLIENT_ID/SECRET` e o developer token já usados pelo proxy.
