# Relatórios automáticos por agência no Slack

Status: Ready for Review
Responsável pela criação: @sm

## Pedido e critérios de aceitação

- [x] TAGB/TAG: segunda às 05h de Brasília, relatório visual PNG por cliente.
- [x] GDM: segunda às 05h de Brasília, relatório em texto por cliente.
- [x] VilasMKT: sexta às 05h de Brasília, relatório visual PNG por cliente.
- [x] Últimos sete dias completos, somente contas da agência com veiculação no período (gasto ou impressões), inclusive contas atualmente pausadas.
- [x] Exibir regras, ativação/pausa, situação e prévia em Avisos Automáticos.
- [x] Usar os vínculos de agência existentes, persistência no servidor e webhook Slack existente (com destinos específicos opcionais por agência).
- [x] Cron autenticado, registro por conta/período contra duplicação e erros visíveis.
- [x] Validar períodos, segregação por agência, falhas, entrega texto/imagem e duplicidade com mocks sem enviar mensagens reais.

## Validação

- `npm run build`: aprovado.
- `npm run lint`: zero erros; dois avisos preexistentes em ClientsContext e ChangeLogContext.
- `npm test`: 13 testes aprovados, cobrindo horários, períodos, paginação, seleção por agência/veiculação, texto/imagem, falhas, autenticação cron e deduplicação/concorrência.
- `npm run typecheck`: indisponível; projeto não define esse script.
- PNG de exemplo renderizado e inspecionado visualmente, com fontes e logos locais.
- Consulta somente leitura ao Supabase confirmou vínculos: TAGB 22, GDM 17, VILAS MKT 18.
- Nenhum relatório real enviado e nenhuma configuração remota alterada.

Regras habilitadas por padrão conforme pedido explícito. É necessário publicar as alterações para registrar o cron da aplicação; o ambiente local não possui webhook Slack nem CRON_SECRET. Produção deve disponibilizar essas variáveis e o bucket existente `report-images`. Os tokens e webhooks não são enviados ao frontend.

A execução aceita a janela das 05h às 05h59 para tolerar variação do agendador. O período fecha no dia anterior em Brasília. Cada entrega é reservada atomicamente por agência, conta e período. Rejeições explícitas ficam disponíveis para nova tentativa; timeout/resultado incerto fica bloqueado para evitar duplicação e aparece no histórico.

Referências: [Vercel Cron](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Slack imagens](https://docs.slack.dev/reference/block-kit/blocks/image-block/).

## File list

- `src/modules/auto-alerts/AutomaticReports.jsx`
- `src/modules/auto-alerts/index.jsx`
- `src/shared/constants/automaticReports.js`
- `src/shared/utils/automaticReportVisual.js`
- `api/_automatic-reports.js`
- `api/_report-image.js`
- `api/alerts/reports.js`
- `api/cron/slack-reports.js`
- `vercel.json`
- `tests/automatic-reports.test.js`
- `package.json` e `package-lock.json`
- `.env.example`
- `public/fonts/`
- `src/modules/report-text/index.jsx`
- `src/shared/utils/reportText.js`
- `src/shared/utils/reportInsights.js`
- `docs/stories/automatic-slack-reports.md`
