# Story: Aba Instagram (métricas orgânicas dos clientes)

**Status:** InReview

## Contexto

Analisar o Instagram dos clientes dentro do painel, com as métricas orgânicas que a API da Meta libera, sem depender do Relatório de Tráfego (que só lê a conta vinculada a cada relatório).

## Decisões

- **Rota `/instagram`**, item "Instagram" na sidebar logo após Google Ads.
- **Contas:** todas as contas profissionais do Instagram ligadas às Páginas que algum token Meta já cadastrado enxerga (`/me/accounts` com `instagram_business_account`), deduplicadas. Nenhum cadastro novo; a conta escolhida fica lembrada no navegador.
- **Período:** o mesmo período compartilhado do painel (`AnalysisPeriodContext`), comparado ao período anterior de mesmo tamanho.
- **Endpoint `api/instagram.js`** (`action=accounts` e `action=overview`), com autenticação do painel e cache em memória (contas 10 min; visão 5 min se o período inclui ontem/hoje, 1 h se é passado). Botão Atualizar ignora o cache.
- **Reuso:** helpers do Instagram de `api/_traffic-report-data.js` (token, seguidores por dia, métrica somada em blocos de 30 dias, posts) passaram a ser exportados; os dados novos ficam em `api/_instagram-data.js`. Os posts agora trazem miniatura (usada também no relatório de tráfego, sem mudança visual lá).
- **Cada métrica lida sozinha:** a recusa de uma (conta com menos de 100 seguidores, métrica retirada da API) vira "—" com aviso; as outras seguem. A lista do que não foi liberado aparece no fim da página.
- **Seguidores:** entradas e saídas por `follows_and_unfollows` (`breakdown=follow_type`); sem ela, cai para o saldo por dia de `follower_count` (só últimos 30 dias).
- **Alcance e contas engajadas acima de 30 dias:** a API entrega em blocos de 30 dias; o total é a soma dos blocos e a página avisa que é aproximado.
- **Engajamento:** interações ÷ alcance, recalculado dos totais (conta, post e formato), nunca média de médias.
- **Gráficos:** alcance por dia e novos seguidores por dia em gráficos separados (sem eixo duplo).
- **Agência por perfil:** nova seção "Instagram" em Configurações para escolher a agência de cada perfil. Usa o mesmo mapa de agências das contas de anúncio (Supabase `account_agencies`), com a chave `ig_<id>` para não colidir com IDs de anúncio. A aba Instagram ganhou o seletor de agência (Todas, cada agência, Sem agência), que filtra a lista de contas e fica lembrado no navegador.

## Acceptance Criteria

- [x] Seletor de conta com todas as contas do Instagram acessíveis pelos tokens Meta
- [x] Perfil: foto, nome, @, bio, seguidores, seguindo, posts
- [x] KPIs com variação vs. período anterior: alcance, visualizações, interações, taxa de engajamento, contas engajadas, novos seguidores, deixaram de seguir, saldo, visitas ao perfil, toques nos links, comentários, salvamentos, compartilhamentos, curtidas, respostas aos stories, posts no período
- [x] Gráficos diários de alcance e de novos seguidores
- [x] Desempenho médio por formato (Reels, Carrossel, Imagem, Vídeo)
- [x] Posts do período com miniatura, métricas, engajamento, ordenação e destaque dos 3 mais engajadores
- [x] Público: gênero, faixa etária e principais cidades
- [x] Stories ativos (últimas 24 h)
- [x] Métricas recusadas pela API aparecem como "—" com o motivo
- [x] Layout responsivo (desktop e celular)
- [x] Configurações → Instagram: escolher a agência de cada perfil
- [x] Aba Instagram: seletor de agência que filtra as contas

## Verificação feita

- 49 contas do Instagram listadas pelos tokens das BMs (servidor de dev local, 22/10/2026).
- Configurações → Instagram listou os 49 perfis com o seletor de agência; a aba mostra Agência, Conta e Período no cabeçalho (22/10/2026).
- Agapantos Vilas do Atlântico, 22/09–21/10/2026: todas as 11 métricas da conta, entradas/saídas de seguidores (38 / 16), séries diárias, 13 posts, 1 story e público retornaram sem recusa da API.
- Página renderizada em Chrome headless (1440 px e 390 px) sem erros no console.
- `npm test` (143 testes, 10 novos), `eslint` nos arquivos alterados e `npm run build` passando.

## File List

- `api/instagram.js` (novo)
- `api/_instagram-data.js` (novo)
- `api/_traffic-report-data.js` (helpers do Instagram exportados; miniatura nos posts)
- `src/modules/instagram/index.jsx` (novo)
- `src/services/instagramApi.js` (novo)
- `src/shared/utils/instagramMetrics.js` (novo)
- `src/App.jsx` (rota `/instagram`)
- `src/layout/Sidebar.jsx` (item Instagram)
- `tests/instagram.test.js` (novo)
- `src/modules/settings/InstagramAgencies.jsx` (novo: agência de cada perfil)
- `src/modules/settings/index.jsx` (seção Instagram)
