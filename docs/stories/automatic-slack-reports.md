# Envio de relatórios por agência ao Slack

## Comportamento atual

- A página protegida **Enviar Relatórios** (`/envio-relatorios`) fica separada de **Avisos Automáticos**.
- O usuário escolhe um período de 1 a 31 dias completos e aciona TAGB, GDM ou VilasMKT separadamente. Também pode consultar uma prévia sem publicar nada.
- Cada ação consulta as contas vinculadas à agência no Meta Ads e envia uma mensagem por conta com gasto ou impressões no período. Contas pausadas que tiveram veiculação entram no resultado.
- TAGB recebe um PNG exportado do mesmo componente `ReportCard` da aba **Relatório Visual**; GDM recebe texto; VilasMKT recebe imagem e texto juntos na mesma mensagem por conta. O navegador gera e publica os PNGs no bucket `report-images` antes de iniciar qualquer envio. Cada agência usa apenas seu webhook exclusivo `SLACK_WEBHOOK_REPORTS_TAGB`, `SLACK_WEBHOOK_REPORTS_GDM` ou `SLACK_WEBHOOK_REPORTS_VILASMKT` no servidor. Não há fallback para o canal de alertas.
- O envio é autenticado e tem reserva atômica por agência, conta e período. Um novo clique informa mensagens já entregues e evita duplicação; rejeição explícita permite tentar novamente. Entregas sem confirmação exigem conferência no canal.
- A consulta Meta usa primeiro o token conectado no painel; se ele for rejeitado com HTTP 401, tenta as credenciais disponíveis no servidor. Se todas falharem, orienta a reconectar em Configurações. O token não é armazenado no histórico nem enviado ao Slack.
- A execução semanal anterior foi removida de `vercel.json` e sua função de cron foi excluída.
- A versão da reserva de entrega visual foi atualizada para permitir que um clique envie os PNGs corrigidos de um período já enviado com o layout antigo.

## Configuração

Configure os três webhooks como variáveis de ambiente **somente no servidor** no ambiente de hospedagem. O arquivo `.env` local é ignorado pelo Git e já contém os valores informados para este workspace. A publicação exige que as mesmas variáveis sejam configuradas no provedor; elas não fazem parte do build do frontend. O token Meta e o bucket público `report-images` continuam necessários.

## Validação local

`npm test`, `npm run build` e `npm run lint`. Os testes usam webhooks simulados e não enviam mensagens reais. O lint mantém dois avisos preexistentes nos contextos ChangeLog e Clients.
