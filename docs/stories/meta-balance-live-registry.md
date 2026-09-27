# Saldos Meta ao vivo para contas de tokens de BM

Saldos de algumas contas Meta apareciam maiores que o real (até o dobro). Causa: no `/me/adaccounts`, o proxy devolvia para contas cobertas por token de BM a cópia salva no Supabase no cadastro/atualização do token, com `balance`, `amount_spent`, `spend_cap` e `funding_source_details` congelados.

- [x] Proxy consulta `/me/adaccounts` ao vivo com cada token de BM, na ordem de prioridade.
- [x] Ordem de consulta: token da BM ao vivo → token de perfil ao vivo. A cópia do registro nunca é fonte de saldo.
- [x] Conta que nenhum token consulta segue listada sem nenhum campo financeiro e com `balance_error`.
- [x] `calculateMetaBalance` retorna `hasReliableBalance: false` e `balanceError` nesse caso; tela de Saldos e Configurações mostram "Erro ao consultar".
- [x] Falha na consulta da conta ou ao recarregar a lista substitui o saldo por erro (nada de valor anterior).
- [x] Testes: ao vivo prevalece; fallback para token de perfil; sem token válido, nenhum campo financeiro.

Arquivos: api/meta-proxy.js; src/shared/utils/metaBalance.js; src/contexts/MetaAdsContext.jsx; src/modules/meta-balances/index.jsx; src/modules/settings/index.jsx; tests/meta-tokens.test.js; esta story.

Status: Ready for Review. Alterações locais, sem publicação.

Validação: 46 testes passaram; build aprovado; lint sem erros (dois avisos preexistentes).
