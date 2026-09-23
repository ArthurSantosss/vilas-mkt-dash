# Google Ads: saldos e relatórios no padrão Meta

## Solicitação

Remover os indicadores agregados acima das contas Google Ads, diagnosticar a recusa de permissão, adicionar Saldos Google e permitir escolher Meta/Google nos relatórios visual e em texto.

## Critérios de aceite

- [x] Visão Geral Google sem cartões de totais acima das contas.
- [x] Erros Google com código, contexto da conta/perfil e orientação, sem inferir suspensão a partir de mensagem genérica.
- [x] Leituras tentam caminhos alternativos já autorizados quando o caminho escolhido perde permissão.
- [x] Saldos Google no mesmo componente visual da Meta, com gastos reais e preferências isoladas; saldo indisponível não vira zero nem orçamento disponível.
- [x] Relatórios visual e texto com seletor de plataforma, conta e campanha; seleção não mistura dados entre plataformas.
- [x] Google utiliza conversões/cliques e sua identificação visual, sem inventar alcance, mensagens ou engajamentos Meta.
- [x] Exportação PNG e cópia de texto preservam o padrão existente.
- [x] Testes, build e lint verificados; limites de validação e orientação documentados.

## Arquivos e validação

Status: Ready for Review. Implementação local; ainda não publicada por esta tarefa.

### Diagnóstico real

Consulta autenticada de status em produção identificou um aviso no perfil arthurvilas@gmail.com para a raiz 1836650117. O perfil lista outras oito contas e o outro perfil lista seis, sem aviso. Nenhuma das 14 contas retornadas está marcada indisponível. A versão publicada descarta detalhes do erro: não é possível concluir suspensão ou a causa exata. Após publicar, sincronizar em Configurações para obter o código detalhado. Conferir no Google Ads da conta 183-665-0117: Administrador → Acesso e segurança; garantir acesso ao perfil ou à MCC correta.

### Limites

- Gastos mensais são consultados no Google. Metas, meio e datas de pagamento são controles manuais, separados da Meta. Saldo pré-pago, crédito e dias restantes ficam indisponíveis, sem substituição por orçamento de campanha. Referência: https://developers.google.com/google-ads/api/docs/billing/overview
- Google exporta PNG e texto; links públicos dinâmicos continuam exclusivos da Meta. O endpoint público existente consulta apenas Meta e não foi conectado às credenciais privadas Google.
- Não houve alteração de campanhas nem permissões de contas reais durante a validação.

### Validação

- 31 testes passaram, incluindo fallback entre perfis autorizados, rejeição de conta alheia, filtro de campanhas nas duas consultas, saldo nulo, fuso/período, conversões fracionadas e diagnóstico.
- Build passou. Lint sem erros, com dois avisos preexistentes em ChangeLogContext e ClientsContext.
- npm run typecheck: script inexistente no projeto.
- Chrome headless com respostas fictícias: relatório texto/visual, PNG baixado e inspecionado, Saldos Google, troca Google → Meta sem relatório antigo, visão Google sem cartões agregados. Sem erros JavaScript. Fixtures não validam concessões reais Google.

### Arquivos

- api/google-ads-proxy.js; api/_google-ads-errors.js
- src/contexts/GoogleAdsContext.jsx; src/services/googleAdsApi.js; src/services/googleReports.js
- src/modules/google-ads/index.jsx; src/modules/google-balances/index.jsx; src/modules/meta-balances/index.jsx
- src/modules/report-text/index.jsx; src/modules/report-visual/index.jsx
- src/shared/components/GoogleAdsIssues.jsx; PlatformFilter.jsx; ReportCard.jsx
- src/shared/utils/googleReports.js; reportText.js; format.js; cloudBackup.js
- src/App.jsx; src/layout/Sidebar.jsx
- tests/google-ads.test.js; tests/google-reports.test.js
- docs/stories/google-ads-parity.md

Alterações simultâneas de tokens Meta/settings encontradas no workspace pertencem a outro trabalho e não foram incluídas nesta lista.
