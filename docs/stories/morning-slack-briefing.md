# Briefing matinal no Slack e alertas mais precisos

## Status

InReview — implementado em 12/10/2026; ativação em produção depende de publicação e variáveis do servidor.

## Pedido e objetivo

O usuário solicitou um briefing no Slack diariamente às 7h e alertas mais precisos. A atividade prioritária informada é revisar contas e decidir o que otimizar. A entrega deve apresentar prioridades com evidências e próximos passos, reduzindo conferência manual, sem executar alterações nas campanhas.

## Critérios de aceite

- [x] Uma função de cron dedicada envia um briefing diário às 7h de `America/Bahia` (10h UTC), usando o webhook de alertas configurado no servidor, sem depender do navegador aberto.
- [x] O briefing identifica data, períodos analisados, plataformas consultadas, contas cobertas e prioridades ordenadas por gravidade. Cada prioridade informa conta, evidência e próxima ação sugerida.
- [x] O briefing também é entregue quando não há alertas, distinguindo ausência de problemas detectados de dados insuficientes ou falhas de coleta.
- [x] A janela de desempenho usa sete dias completos comparados aos sete anteriores. Meta exclui o dia em andamento; Google também exclui os dois dias completos mais recentes para reduzir efeito do atraso de conversão. Os períodos efetivos aparecem na mensagem.
- [x] Os valores iniciais da avaliação exigem gasto mínimo de 50 na moeda da conta, base mínima de cinco resultados e piora de custo de pelo menos 35%; ausência de resultados só gera alerta quando há histórico comparável de conversões/conversas. Os limites devem permanecer explícitos e normalizados.
- [x] Métricas mantêm significado e moeda: conversas Meta e conversões Google não são chamadas indistintamente de leads, nem agregadas em um único custo. Critérios de desempenho respeitam o objetivo conhecido; ausência de mensagens não prova falha em campanhas com outro objetivo.
- [x] Alertas de piora apresentam valores e variação entre períodos comparáveis. Resultados recentes do Google são tratados como provisórios por possível atraso de conversão.
- [x] Falhas de consulta não viram gasto, saldo ou resultados iguais a zero. Cobertura incompleta é explicitada; ausência de base suficiente não produz diagnóstico categórico.
- [x] Alertas de saldo usam somente valores confiáveis. Limite de orçamento e saldo pré-pago são identificados corretamente. Conta desativada, isoladamente, não é classificada como falha de cobrança.
- [x] A avaliação de alertas é compartilhada entre interface e backend para entradas equivalentes, preservando as configurações existentes de limites.
- [x] O horário de alertas já existente, 12h de Bahia (15h UTC), envia apenas problemas novos ou agravados desde o envio confirmado anterior; não repete diariamente problemas inalterados fora do briefing.
- [x] A reserva persistente de entrega impede duplicação em chamadas concorrentes ou repetidas do mesmo briefing. Rejeição explícita do Slack permite nova tentativa; entrega incerta é registrada sem reenvio automático que possa duplicá-la.
- [x] O histórico de problemas notificados só avança após entrega confirmada. Falha de coleta não marca um problema anterior como resolvido.
- [x] A rota recusa chamadas sem segredo de cron válido, incluindo ambiente sem segredo configurado. Tokens e webhooks permanecem no servidor e não aparecem em respostas ou logs.
- [x] A mensagem respeita limites de tamanho do Slack, preserva um resumo quando houver mais itens que o limite e escapa nomes/textos externos.
- [x] Há validação automatizada de períodos, amostras mínimas, falhas de dados, semântica de pagamentos, deduplicação, novos/agravados, autenticação e formato da mensagem, sem enviar mensagens reais durante os testes.
- [ ] Entrega local, configuração publicada e ativação em produção são reportadas separadamente, com evidência do que foi efetivamente verificado (local verificado; produção pendente).

## Decisões de arquitetura

1. Criar `/api/cron/morning-briefing` com agendamento diário próprio às 10h UTC e manter `/api/cron/slack-alerts` às 15h UTC em `vercel.json`. Cada job roda uma vez ao dia; manter a automação operacional no servidor, reaproveitando a infraestrutura existente.
2. Centralizar regras em `src/shared/utils/automaticAlerts.js` e normalizar os dados das duas plataformas antes da avaliação. Valores de limites pertencem às constantes/configurações já existentes.
3. Coletar Meta usando o registro de conexões e resolução de token por conta existente; usar fallback de ambiente quando aplicável, mantendo explícitas falhas de cobertura. Coletar Google com os helpers de conexão/consulta existentes, sem duplicar credenciais ou OAuth.
4. Reutilizar a persistência `app_preferences` e a reserva atômica de `createReportStore` em `api/_automatic-reports.js`, com chaves próprias do briefing/alertas. A chave do briefing inclui a data local e a versão da regra; snapshots de alertas devem distinguir plataforma, conta e tipo de problema.
5. Separar coleta, avaliação, formatação e entrega para permitir testes determinísticos com relógio e dependências injetados. Deduplicação usa identidade estável; agravamento usa severidade ou variação material documentada, não pequenas oscilações textuais.

## Riscos e limites conhecidos

- O cron atual consulta `today`, converte falhas de insights em zeros, envia todos os problemas novamente e só verifica o segredo quando ele existe. Esses comportamentos precisam ser substituídos.
- Os períodos devem ser consistentes com o fuso da conta/plataforma; o horário de envio é Bahia. Datas de relatório e atraso de conversões precisam constar da interpretação.
- `readMetaConnectionsSafe` oculta falhas do registro para permitir fallback; o briefing não deve apresentar esse fallback como cobertura integral confirmada.
- Uma reserva `pending` após timeout impede duplicação, mas pode exigir conferência operacional. Não prometer entrega exatamente uma vez em caso de resposta incerta do Slack.
- Volume de contas, paginação e chamadas às APIs precisam caber no tempo da função. Usar concorrência limitada e coletar erros por conta sem cancelar resultados válidos das demais.
- Ativação depende de publicação do código e das variáveis de servidor (`CRON_SECRET`, webhook, acesso Supabase e conexões das plataformas). Não afirmar que o agendamento está ativo somente por editar `vercel.json`.
- O projeto JavaScript não possui script `typecheck` no estado inicial. Registrar essa limitação no gate; não simular validação de tipos bem-sucedida.

## Plano e checklist

- [x] Inspecionar cron, avaliador compartilhado, store atômico, registro Meta e helpers Google existentes.
- [x] Definir critérios de aceite e decisões de arquitetura.
- [x] Implementar avaliação compartilhada e normalização das plataformas.
- [x] Implementar coleta, briefing, histórico de alertas e entrega idempotente.
- [x] Atualizar agendamento e apresentação/configuração existente quando necessário.
- [x] Executar testes, lint, build e registrar resultado de typecheck.
- [x] Revisar alterações e atualizar status, checklist e lista final de arquivos.
- [ ] Registrar situação de publicação/ativação e limitações restantes (pendente: deploy).

## Validação

- `npm test`: 83/83 passando (inclui `tests/slack-briefing.test.js` e `tests/creative-fatigue.test.js`), com APIs e webhook simulados; nenhuma mensagem real enviada.
- Projeto não possui script `typecheck`.
- O briefing também inclui o alerta `creative_fatigue` (ver `assistant-tools-and-creative-fatigue.md`).
- A página `/avisos` foi alinhada às regras novas: removida referência a variável inexistente (`accounts`), campos para todos os limites e descrição das verificações atualizada.

## Ativação

1. Publicar o código (deploy de produção na Vercel).
2. Variáveis no servidor: `CRON_SECRET` (obrigatório — sem ele a rota recusa tudo), `SLACK_WEBHOOK_ALERTS`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_EMAIL`, token Meta e conexões Google.
3. Conferir o primeiro envio às 7h (Bahia) no canal de alertas.

## File list

- `docs/stories/morning-slack-briefing.md`
- `api/cron/morning-briefing.js` (novo)
- `api/cron/slack-alerts.js`
- `api/_slack-briefing.js` (novo)
- `api/_briefing-data.js` (novo)
- `api/alerts/briefing.js` (novo)
- `api/_automatic-reports.js`
- `api/google-ads-proxy.js`
- `src/shared/utils/automaticAlerts.js`
- `src/shared/constants/autoAlerts.js`
- `src/contexts/AlertsContext.jsx`
- `src/modules/dashboard/AlertsPanel.jsx`
- `src/modules/dashboard/index.jsx`
- `src/modules/auto-alerts/index.jsx`
- `vercel.json`
- `tests/slack-briefing.test.js` (novo)
- `tests/dashboard-alerts.test.js`
