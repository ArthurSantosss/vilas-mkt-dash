# Aba Clientes

Status: Ready for Review
Responsável pela criação: @sm

## Pedido

Como gestor da agência, quero uma aba Clientes para cadastrar clientes, vincular a eles as contas de anúncio (Meta Ads e Google Ads) e os perfis do Instagram, registrar anotações e organizar pagamentos e recebimentos.

## Critérios de aceitação

- [x] Item "Clientes" na navegação (desktop e mobile), com rota `/clientes`.
- [x] Cadastro, edição e exclusão de clientes (nome, agência e, na Vilas MKT, mensalidade e dia de vencimento). Sem status nem dados de contato (todos os clientes são ativos).
- [x] Clientes divididos por agência (abas e agrupamento). A Vilas MKT recebe por cliente; as demais agências pagam salário fixo, com financeiro próprio na aba da agência (valor, dia, lançar salário do mês).
- [x] Seletor "Cliente" em cada conta Meta Ads, Google Ads e Instagram em Configurações, gravando no mesmo cadastro da aba Clientes. Cada conta pertence a um único cliente, e vincular uma conta a um cliente coloca a conta na agência dele.
- [x] Vínculo de contas Meta Ads, Google Ads e perfis do Instagram, com busca e aviso quando a conta já está vinculada a outro cliente.
- [x] Anotações por cliente: criar, editar, fixar no topo e excluir.
- [x] Financeiro por cliente: lançamentos de recebimento e pagamento com valor, vencimento, situação e data de pagamento; marcar como pago/pendente; lançar a mensalidade do mês sem duplicar.
- [x] Resumo: a receber, recebido no mês, em atraso e a pagar (geral ou da agência selecionada).
- [x] Dados persistidos no navegador e incluídos no backup da nuvem (`app_preferences`), como as demais configurações.

## Implementação e validação

- [x] Regras puras em `src/shared/utils/clients.js` com testes em `tests/clients.test.js`.
- [x] `ClientsContext` reescrito para localStorage + backup na nuvem (a versão antiga apontava para uma tabela `clients` inexistente e não era usada).
- [x] Página `src/modules/clients/index.jsx` reescrita.
- [x] `npm run lint`: sem problemas.
- [x] `npm test`: 154 testes, 0 falhas.
- [x] `npm run build`: concluído.
- [ ] Validação manual no navegador (requer login).

## File list

- `src/shared/utils/clients.js`
- `tests/clients.test.js`
- `src/contexts/ClientsContext.jsx`
- `src/modules/clients/index.jsx`
- `src/modules/clients/ClientSelect.jsx`
- `src/modules/settings/index.jsx`
- `src/modules/settings/InstagramAgencies.jsx`
- `src/shared/utils/cloudBackup.js`
- `src/App.jsx`
- `src/layout/Sidebar.jsx`
- `docs/stories/clients-tab.md`
