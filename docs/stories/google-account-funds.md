# Saldo na visão de contas Google Ads

Adicionar a coluna Saldo / fundos na visão Google Ads e no cartão mobile, seguindo a apresentação da Meta.

- [x] Coluna reordenável, compatível com preferências já salvas, apenas por conta.
- [x] Saldo real indisponível explicitamente identificado, com atalho para conferência no Google Ads.
- [x] Restante da meta mensal identificado como orçamento, nunca como fundos reais; gasto mensal independente do filtro de período.
- [x] Verificações registradas.

Arquivos: src/modules/google-ads/index.jsx; src/shared/components/GoogleAccountFunds.jsx; esta story.

Status: Ready for Review. Alterações locais, sem publicação.

Validação: 41 testes passaram; build aprovado; lint sem erros (dois avisos preexistentes); typecheck indisponível por ausência de script. Chrome isolado com dados fictícios confirmou coluna desktop e mobile, fundos indisponíveis sem zero falso e meta 1.000 menos gasto mensal 125 = 875. Nenhum erro JavaScript. O link abre faturamento Google; o tooltip orienta selecionar a conta pelo ID, sem presumir que o ID de cliente seja o ocid interno do Google.

Limite: o endpoint atual retorna saldo pré-pago nulo. Recursos de faturamento documentados pelo Google são voltados a faturamento mensal: https://developers.google.com/google-ads/api/docs/billing/overview . Nenhuma estimativa de orçamento é apresentada como depósito real.
