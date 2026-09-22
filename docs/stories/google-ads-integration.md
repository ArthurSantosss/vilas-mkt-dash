# Google Ads: múltiplos perfis, MCC e acesso direto

## Objetivo

Conectar perfis Google diferentes sem substituir conexões existentes e reunir contas diretas e gerenciadas por MCC no dashboard. Corrigir os problemas identificados na avaliação: credenciais em preferências públicas, autenticação por e-mail, falhas globais de descoberta e relatórios incompletos.

## Critérios de aceite

- [x] Credenciais persistidas em tabela privada, sem acesso anon/authenticated e sem retorno ao navegador.
- [x] API exige sessão válida; OAuth tem state validado no servidor, uso único e PKCE.
- [x] Vários perfis identificados pelo Google, com conexão e desconexão individuais.
- [x] Contas diretas/MCC/sub-MCC descobertas, deduplicadas e consultadas pelo perfil correto.
- [x] Falhas parciais visíveis; paginação completa e datas no fuso da conta.
- [x] Instruções de migração e configuração disponíveis.
- [x] Testes, lint e build executados; registrar eventual indisponibilidade de typecheck.

## Arquivos

- `.env.example`
- `README.md`
- `api/_auth.js`
- `api/google-ads-proxy.js`
- `src/services/googleAdsApi.js`
- `src/contexts/GoogleAdsContext.jsx`
- `src/modules/settings/index.jsx`
- `src/modules/dashboard/index.jsx`
- `src/modules/detailed-view/index.jsx`
- `supabase/migrations/20260922000000_google_ads_private_connections.sql`
- `tests/google-ads.test.js`
- `tests/google-ads-client.test.js`
- `docs/google-ads-setup.md`
- `docs/stories/google-ads-integration.md`
- `vercel.json`

## Validação

- `npm test`: 23 testes aprovados, incluindo 10 novos casos Google Ads/cliente/autenticação.
- `npm run build`: aprovado.
- `npm run lint`: zero erros, dois avisos preexistentes em ChangeLogContext e ClientsContext.
- `npm run typecheck`: indisponível, o projeto não possui esse script; não foi adicionado um comando fictício.
- `git diff --check`: aprovado.

Os testes simulam Google/Supabase. Não houve publicação, execução da migração em banco real ou consulta de contas reais. Faltam no ambiente local as variáveis de OAuth e a service_role do Supabase. O guia lista a configuração necessária.

## Decisões e limites

- O usuário confirmou e-mails Google diferentes. As conexões são indexadas pelo `sub` confirmado pelo Google, dentro do proprietário da plataforma.
- O servidor decide token/MCC a partir das contas descobertas; não aceita um caminho de acesso arbitrário enviado pelo navegador.
- A autenticação compartilhada deixou de aceitar e-mail/localhost como prova de login. Clientes antigos sem cookie precisam entrar novamente. `AUTH_PASS` fica somente no servidor.
- Tokens antigos potencialmente expostos são removidos pela migração; o guia orienta revogar o grant antigo e reconectar.
- Configuração atualizada à migração oficial de setembro/2026: API v25, aprovação pelo projeto Cloud, sem developer token.
- Descobertas parciais mantêm contas anteriores do caminho com falha e mostram avisos; consultas bem-sucedidas determinam as métricas disponíveis.
- A Visão Detalhada estava fixada em Meta apesar de conter lógica Google. Foi habilitada a seleção de plataforma; o dashboard também mostra falhas para evitar interpretar agregados parciais como completos.
- Uma sincronização em andamento atualiza somente conexões existentes, evitando recriar um perfil desconectado nesse intervalo.

