# Contexto e memória do analista

Esta versão mantém o modelo configurado e acrescenta ficha por conta, diagnóstico Meta com evidências e memória de recomendações. O Google recebe ficha/memória na visão geral; não recebe a investigação detalhada Meta.

## Ativação

1. Aplicar `supabase/migrations/20261015000000_assistant_intelligence.sql` no projeto Supabase do dashboard pelo processo habitual de migrations. Ela cria duas tabelas privadas e não altera tabelas existentes.
2. Configurar `SUPABASE_URL` (ou a URL já usada em `VITE_SUPABASE_URL`) e **`SUPABASE_SERVICE_ROLE_KEY` somente no servidor**. A autenticação existente exige `AUTH_EMAIL` e `AUTH_PASS`; a assinatura das propostas usa `AUTH_SESSION_SECRET` ou, na ausência dele, `AUTH_PASS`.
3. Publicar o código pelo fluxo habitual. Para uso local: `npm run dev` executa as APIs existentes pelo middleware Vite.
4. Fazer login e testar os atalhos **Ficha do Cliente**, **Diagnóstico de Conta** e **Acompanhar Decisões** no chat.

Sem as tabelas ou credenciais, a análise continua com uma limitação explícita de memória indisponível. Nenhum dado privado é salvo usando a chave pública como alternativa. Esta mudança não aplica a migration nem publica remotamente.

## Exemplo de uso

> A conta Meta act_123 é de uma clínica em Salvador. A conversão principal é mensagem, a meta de custo é R$ 25 e o orçamento mensal é R$ 3.000. Guarde isso na ficha.

A assistente apresenta uma proposta com os campos e o ID da conta. A ficha só muda após confirmação. Informe a conversão principal como mensagens, leads ou compras. Metas e valores são sempre na moeda da conta. No Google, a conversão da ficha é contexto comercial; as métricas continuam sendo as conversões configuradas na plataforma.

> Analise a conta act_123 nos últimos 14 dias.

O diagnóstico consulta a ficha e as 20 recomendações mais recentes, compara períodos completos e indica observações, hipóteses e limitações. Uma proposta para guardar uma recomendação inclui hipótese, ação e critério de avaliação; o servidor anexa os dados consultados. Guardar a recomendação não altera anúncios.

> Consulte as recomendações anteriores de act_123. Eu executei o teste de oferta; registre essa decisão.

O registro do relato também exige confirmação. Para uma recomendação antiga, informe seu ID para recuperar e atualizar diretamente, mesmo fora das 20 recentes. Relatos não são verificação de execução na plataforma nem prova de impacto causal.

> Remova a meta de custo da ficha de act_123.

Campos não mencionados são preservados. Remover um campo exige uma solicitação explícita; a proposta lista as remoções. Se outra edição acontecer antes da confirmação, o servidor pede uma proposta atualizada. Propostas de memória expiram em 24 horas e não podem ter seu conteúdo modificado após a geração.

## Limites da análise

- Meta: mensagem, lead e compra são eventos distintos; aliases agregados não são somados. Sem conversão principal definida, a análise de custo/escala fica indisponível.
- Ausência de `actions` ou de uma linha de métricas não equivale a zero conversões. Zero observado não produz custo zero.
- Para `month`, comparar os dias completos do mês com a janela imediatamente anterior de igual duração. No primeiro dia do mês, escolher outro período.
- O fuso da conta é usado quando retornado; o fallback é `America/Sao_Paulo`.
- Paginação limitada a cinco páginas por consulta, com cobertura parcial explícita. O resumo mostra até 30 campanhas e dez candidatos por categoria; a lista não representa ausência de outras ocorrências.
- Os limiares de volume e mudança são critérios de triagem, não testes de significância. Candidatos a revisão ou escala exigem avaliação de atribuição, maturação, orçamento e qualidade comercial.
- Sem CRM, a assistente não confirma qualidade de leads, gargalos no atendimento, lucro ou causalidade.
- A memória pertence ao proprietário único configurado no servidor. Não é uma implementação de autenticação multiusuário.
- A memória preserva evidências e decisões estruturadas; não armazena toda a conversa nem verifica automaticamente o resultado de ações na plataforma.

## Verificação via CLI

`node --test tests/assistant-diagnostics.test.js tests/assistant-intelligence.test.js`

Os testes usam dados e credenciais fictícios, cobrindo períodos, seleção de eventos, pouca amostra, falhas parciais, persistência, isolamento, assinatura, confirmação e edição concorrente. Não substituem uma validação com o modelo e as contas conectadas após ativação.
