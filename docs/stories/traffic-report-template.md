# Story: Relatório de Tráfego Pago (novo modelo de link compartilhado)

**Status:** InReview
**Primeiro cliente:** Consórcio Market (públicos Comprador / Vendedor)

## Contexto

Novo modelo para o mesmo mecanismo de link personalizado (`shared_reports`, `/r/:id` e `/:slug`). O cliente escolhe qualquer intervalo no calendário e vê Meta + Google com comparação automática ao período anterior de mesmo tamanho.

## Decisões

- **Onde fica:** Relatórios → Formato → "Relatório completo". Lá se cria/edita a configuração por cliente, vê o relatório dentro do painel e copia o link do cliente.
- **Sem migration:** as configurações ficam em `app_preferences` (chave `traffic_report_configs`). O link é uma linha comum de `shared_reports` com `objective = 'trafego_pago'`; o link público reconhece esse objetivo e abre o novo layout. Esses links não aparecem na lista do modal do formato Visual.

- **Dados ao vivo por intervalo.** O pedido é ver qualquer período "em tempo real", então o servidor consulta Meta e Google direto para o intervalo escolhido (e para o anterior), com cache em memória de 5 min (período que inclui ontem ou hoje) ou 1 h (passado fechado). Alcance e parcela de impressões já vêm da API para o intervalo inteiro, sem soma de dias. Não foi criada tabela diária nem job de sincronização.
- **Conversões separadas por plataforma.** Cada etapa do funil aponta um evento do Meta (`action_type`) e/ou uma ação de conversão do Google. O relatório mostra cada plataforma em linha própria, com o nome do evento. O número é "conversões" (não pessoas únicas).
- **Google:** ação primária usa `metrics.conversions`; ação secundária usa `metrics.all_conversions`.
- **Post turbinado (Meta):** `boosted_object_id` preenchido e campanha que não é cópia de outra (`source_campaign_id` = 0). Ajustável por campanha na configuração.
- **Instagram:** usa os mesmos tokens Meta já cadastrados (precisam de `instagram_basic` e `instagram_manage_insights`). Sem acesso, a aba Posts some e Seguidores mostra "—" com o motivo.
- **Plataforma com erro:** se alguma conta não responder, os números daquela plataforma viram "—" e um aviso no topo diz qual conta falhou (total parcial não é exibido).
- **Formato do anúncio:** não exibido (decisão do usuário).
- **Visual:** segue o site consorciomarket.com.br (azul-marinho #14183F, roxo #6A44FF, verde-água #13D3B9, fundo #F1F3F8, Inter, botões em pílula, cards de 20px, faixa do topo com o degradê do site). O bloco "Como ler" foi removido de todas as abas.
- **Hoje:** atalho "Hoje" (e qualquer período que termine hoje) busca de novo a cada 5 min e mostra um aviso do que ainda é parcial: comparação com o dia anterior completo, atraso do Meta, atraso do Google e parcela de impressões vazia até o dia seguinte, seguidores do Instagram só amanhã.
- **Filtro de plataforma:** Todas / Meta / Google (`?plataforma=`), aparece quando o relatório tem as duas. A plataforma não escolhida sai de totais, funis, campanhas e abas (Leilão some no Meta; Seguidores e Posts somem no Google).
- **Seguidores — novas métricas:** visitas ao perfil (`profile_views`) e cliques no link da bio (`website_clicks`) vêm do Instagram (total_value, lidas uma a uma; se a API recusar, aparece “—” com o motivo). Conversas iniciadas = `onsite_conversion.messaging_conversation_started_7d` dos anúncios Meta, com custo por conversa.
- **Funis separados por campanha:** cada funil (Comprador/Vendedor) usa só as campanhas ligadas a ele na configuração — gasto, cliques, conversões e custo por conversão não se misturam, na Visão geral e na aba Campanhas (o seletor filtra a árvore inteira). Campanhas sem funil ficam de fora e aparecem num aviso com quantidade e gasto. Sem públicos configurados (funil único), vale a conta inteira.
- **Campanhas — alcance, frequência e página de destino:** alcance lido da API por campanha/anúncio e, para as linhas Meta e Total, por grupo de campanhas (`filtering campaign.id IN`), sem somar pessoas; com mais de uma conta Meta o alcance do grupo fica “—”. Frequência = impressões do Meta ÷ alcance. Visualizações da página de destino = `landing_page_view`. Google não mede essas três (“—”).
- **Campanhas — seletor de plataforma:** Ambas / Meta / Google na própria aba, ligado ao mesmo filtro `?plataforma=`; plataforma sem conta no relatório fica desabilitada.
- **Funis:** desenhados como funil (etapas em trapézio, cada uma 20% mais estreita), com taxa de passagem entre etapas e taxa da 1ª à última.

## Acceptance Criteria

- [x] Formato "Relatório completo" no seletor de Relatórios, com visualização no painel e botão "Copiar link do relatório"
- [x] Configuração por cliente: contas Meta e Google, Instagram, públicos (ou nenhum), funis de até 3 etapas, público por campanha, ajuste de post turbinado
- [x] Atalhos (7 dias, 30 dias, mês passado, este mês), calendário de intervalo (dias futuros desabilitados), texto de comparação, selo de atualização
- [x] Período na URL (`?inicio=&fim=`) mantido ao trocar de aba (`&aba=`)
- [x] Abas Visão geral, Campanhas (árvore), Leilão Google, Seguidores, Posts (se houver Instagram), cada uma com "Como ler"
- [x] Derivadas recalculadas dos totais; variação em % e p.p.; cores pela direção boa de cada métrica; cinza para "novo" / "sem comparação"
- [x] Meta "cliques" = `inline_link_clicks`
- [x] Exportar PDF (impressão do navegador com todas as abas)
- [x] Formatação pt-BR (R$ 1.234,56 · 8,1% · DD/MM)
- [x] Visual da Consórcio Market, sem "Como ler"
- [x] Atalho "Hoje" com aviso do que é parcial e atualização a cada 5 min
- [x] Filtro de plataforma (Todas / Meta / Google) mantido na URL
- [x] Funis Comprador e Vendedor em formato de funil
- [x] Seguidores: visitas ao perfil, cliques no link da bio, conversas iniciadas e custo por conversa
- [ ] Conferência manual com Gerenciador de Anúncios e Google Ads no mesmo intervalo

## Verificação feita

- Meta, Consórcio Market, 06/10–19/10: soma do relatório = insights da conta (R$ 1.255,21 · 40.032 impressões · 866 cliques no link).
- A conta Meta do Consórcio Market só tem veiculação a partir de 06/10/2026; 17/09–03/10 retorna vazio na própria API.
- Meta, hoje (20/10, parcial): R$ 133,12 contra R$ 124,74 em 19/10; a API devolve o dia corrente normalmente.
- Google não pôde ser testado localmente (as credenciais ficam no registro do servidor).

## File List

- `api/traffic-report.js` (novo)
- `api/_traffic-report-data.js` (novo)
- `api/_meta-graph.js` (novo, extraído de `api/public-report.js`)
- `api/public-report.js` (usa `_meta-graph.js`)
- `src/shared/utils/trafficMetrics.js` (novo)
- `src/modules/public-report/index.jsx` (escolhe o layout pelo template)
- `src/modules/public-report/traffic/` (novo: `TrafficReport.jsx`, `DateRangePicker.jsx`, `OverviewTab.jsx`, `CampaignsTab.jsx`, `AuctionTab.jsx`, `FollowersTab.jsx`, `PostsTab.jsx`, `ui.jsx`, `traffic-report.css`)
- `src/modules/report-full/` (novo: `index.jsx`, `TrafficReportConfig.jsx`, `trafficReportApi.js`)
- `src/modules/reports/index.jsx` e `src/shared/components/ReportFormatSelector.jsx` (formato "Relatório completo")
- `src/modules/report-visual/index.jsx` (lista de links ignora os de Tráfego Pago)
- `index.html` (Inter 800/900)
- `tests/traffic-metrics.test.js` (novo)
