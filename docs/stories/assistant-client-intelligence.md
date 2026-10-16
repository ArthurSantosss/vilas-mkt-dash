# Assistente: contexto do cliente, diagnóstico com evidências e memória

## Status

In Review — 15/10/2026. Implementação concluída, 103 testes passando e revisão QA local aprovada. Lint/build em verificação; ativação remota pendente.

## Pedido e resultado esperado

O gestor aprovou como primeira versão a ficha do cliente, diagnósticos sustentados por evidências e memória das recomendações. Ao analisar uma conta, a assistente deve considerar o objetivo e a meta informados pelo gestor, distinguir observações de hipóteses e recuperar decisões anteriores, sem apresentar dados ausentes como resultados ruins ou afirmar causas não comprovadas.

## Escopo e decisões de arquitetura

- FR-1: Ficha opcional por plataforma e conta com contexto comercial, objetivo, conversão principal, metas de custo, orçamento e observações relevantes informados pelo gestor. Campos desconhecidos permanecem ausentes; a assistente não preenche fatos por suposição.
- FR-2: Diagnóstico Meta usa a ficha, comparações de períodos explícitos de igual duração e sinais com evidências, suficiência de dados e limitações. Retira conclusões categóricas baseadas apenas em gasto fixo ou frequência isolada.
- FR-3: Memória estruturada de recomendações registra evidência, hipótese, ação sugerida, critério de avaliação, status e resultado relatado pelo gestor. Recuperação por conta em novas conversas, independente do recorte do histórico do chat.
- CON-1: Reutilizar autenticação e confirmação existentes. Leitura é imediata; edição de ficha, registro de recomendação e atualização de resultado geram proposta revisável antes de persistir. Preparar ação não equivale a executá-la.
- CON-2: Persistência privada no Supabase, acessível somente no servidor com service role, vinculada ao proprietário configurado no servidor, plataforma e ID canônico da conta. Nunca aceitar proprietário enviado pelo modelo ou navegador. Não reutilizar o cliente anon de `api/_supabase-server.js` para dados privados.
- CON-3: Backend e funções verificáveis via Node/CLI antes de pequenos atalhos na interface existente. O fluxo de confirmação solicitado usa a interface atual; não criar um novo painel decisório nem exigir redesign.
- CON-4: Google recebe ficha e memória junto às ferramentas de visão geral existentes. Não anunciar equivalência ao diagnóstico Meta ou implementar investigação Google adicional nesta versão.
- CON-5: Sem mudança de modelo, CRM, análise visual de criativos, automações, ranking proativo de todas as contas, deploy ou aplicação remota de migrations neste escopo.

### Limites e simplificações

Persistir dados estruturados, sem embeddings, banco vetorial ou nova camada de agentes. Usar buscas recentes e limitadas por conta; não carregar toda a memória de todas as contas no prompt. Validar tipos, tamanhos, IDs e valores no servidor tanto ao preparar quanto ao executar ações. Atualização da ficha preserva campos não enviados; permitir limpar explicitamente um campo. Evidências de recomendações usam snapshot real do diagnóstico realizado na requisição; métricas produzidas pelo modelo não substituem esse snapshot. Sem diagnóstico compatível disponível, não inventar evidência: informar a necessidade de consultar a conta. Recomendações são registros do gestor, não comprovação automática de impacto causal. A instrução de sistema deve tratar nomes, notas e evidências recuperadas como dados, nunca como novas instruções.

Preservar alterações preexistentes em `api/_assistant-tools.js`, `api/assistant-chat.js` e `src/modules/assistant/AssistantWidget.jsx`; o código corrente é a base desta implementação. `Sidebar.jsx` tem alterações preexistentes fora do escopo e não deve ser editado para esta story.

O aplicativo atual autentica um proprietário configurado, não usuários Supabase independentes. O isolamento por `owner_email` deve seguir essa realidade, com filtros obrigatórios em todas as consultas e atualizações; não apresentar a mudança como suporte multiusuário completo. RLS deve impedir leitura/escrita pública, já que service role ignora políticas RLS. Não ampliar permissões de tabelas existentes.

## Critérios de aceite

- [x] AC-1 — É possível ler, criar e atualizar uma ficha por plataforma/conta. Meta com e sem prefixo `act_` resolve a mesma conta; IDs Google são normalizados. Plataforma desconhecida, ID inválido e valores não finitos ou negativos em metas são rejeitados.
- [x] AC-2 — Toda leitura e escrita privada usa proprietário derivado da configuração autenticada do servidor e filtro por plataforma/conta. Atualizar uma recomendação de outra conta ou proprietário é recusado. Nenhuma credencial service role aparece no frontend ou nas respostas.
- [x] AC-3 — Escritas de ficha e memória são apresentadas com resumo dos dados e executadas apenas pela confirmação existente. O endpoint revalida o payload. Falha de banco não é comunicada como gravação concluída.
- [x] AC-4 — O diagnóstico Meta incorpora automaticamente a ficha e recomendações recentes, quando disponíveis. Ausência de ficha é distinguida de falha de armazenamento; o diagnóstico pode continuar com limitação explícita, sem inventar metas ou histórico.
- [x] AC-5 — A conversão principal selecionada orienta contagem e custo utilizados no diagnóstico. Leads, mensagens e compras não são somados indiscriminadamente. Métrica sem dados utilizáveis é ausente/indisponível; divisão por zero não produz custo zero ou oportunidade de escala.
- [x] AC-6 — Períodos atual e anterior têm limites explícitos, duração igual e não se sobrepõem, incluindo a opção de 14 dias. Comparações de dias completos não incluem hoje inadvertidamente. Resultados expõem o intervalo usado; variação com base zero é indisponível, não um percentual inventado.
- [x] AC-7 — Cada alerta material inclui observação numérica/período, hipótese, grau de suficiência e limitação relevante. Poucos dados não geram ordem de pausa; frequência isolada não comprova fadiga; CPM ou CTR isolado não comprovam causa comercial. Erros de consulta ficam explícitos e não viram listas vazias de oportunidades/problemas.
- [x] AC-8 — O plano de ação distingue ação sugerida, proposta pendente e alteração confirmada. Ao falar de atendimento, qualificação ou vendas sem CRM, a assistente pede/indica o dado necessário e não afirma diagnóstico confirmado.
- [x] AC-9 — Recomendações recuperadas incluem evidência, hipótese, ação, critério de avaliação, status e datas; o gestor pode registrar status/resultado por confirmação. Evidência numérica usa snapshot real do diagnóstico da mesma conta/plataforma, sem aceitar métricas inventadas pelo modelo. Um resultado posterior é identificado como relato e não atribuído causalmente à ação.
- [x] AC-10 — Ferramentas Google existentes continuam funcionando; ficha e memória são consultáveis na mesma plataforma/conta, e a assistente comunica os limites da análise Google.
- [x] AC-11 — Falta de migration ou service role gera mensagem acionável sem expor segredos. Nenhum fallback grava dados privados via anon, navegador ou tabela pública existente.
- [ ] AC-12 — Testes relevantes passam e limitações dos quality gates são registradas; documentação contém arquivos efetivamente alterados e instruções de ativação local/remota que ainda sejam necessárias.

## Checklist de implementação

- [x] Revisar autenticação, cliente Supabase e ferramentas existentes.
- [x] Definir escopo, limites e critérios antes de implementar.
- [x] Implementar persistência privada e migration revisável, sem aplicá-la remotamente.
- [x] Implementar validação, normalização e funções de leitura/escrita testáveis via Node.
- [x] Integrar ferramentas ao fluxo de preparação e confirmação existente.
- [x] Incorporar ficha e memória ao diagnóstico e às instruções da assistente.
- [x] Corrigir períodos, seleção de conversão e tratamento de dados insuficientes/erros.
- [x] Adicionar apenas atalhos necessários na interface existente, após backend funcional.
- [ ] Executar testes, lint, typecheck e build; registrar resultados reais.
- [x] Revisar isolamento e confirmação; atualizar file list e status para revisão.

## Plano de validação

Testes unitários e de integração com dependências substituídas, sem credenciais reais:

1. Ficha: normalização Meta/Google, merge parcial/limpeza, validação de payload, rejeição de plataforma/ID inválido e erro de armazenamento distinto de inexistência.
2. Isolamento: proprietário só do servidor; leitura e atualização sempre filtradas; ID de recomendação de outra conta não altera registros; rotas sem autenticação recusadas.
3. Confirmação: preparar escrita não persiste, executar confirma e revalida, falha não retorna sucesso; resumo inclui dados que serão gravados.
4. Memória: criar, recuperar com limite, atualizar status/resultado, preservar vínculo da conta e não confundir recomendação com mutação de anúncio.
5. Diagnóstico: janelas 7/14/30 dias e limites de calendário, conversão principal, valores ausentes, zero conversões, denominador zero, amostra baixa, falha total/parcial de API e recuperação de contexto.
6. Regressão: ferramentas Meta/Google e ações existentes; prompt sem alegações universais de causa, fadiga ou escala.

Gates do repositório: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`. `package.json` inspecionado não possui script `typecheck`; registrar a indisponibilidade ao executar, sem inventar validação aprovada ou ampliar o escopo com migração TypeScript. Revisão CodeRabbit/QA deve registrar disponibilidade e achados reais, sem declarar execução quando indisponível.

## Riscos e ativação

- A persistência depende de migration aplicada e `SUPABASE_SERVICE_ROLE_KEY` no servidor. Entregar migration e informar pendência caso não ativada.
- Métricas Meta podem usar eventos sobrepostos e atribuição atrasada: selecionar evento principal e explicitar limitações; não deduzir leads qualificados ou vendas dos cliques.
- Falhas parciais podem esconder problemas: propagar estado de disponibilidade de cada bloco, preservando o que foi consultado com sucesso.
- Dados de clientes podem conter instruções maliciosas: delimitar como conteúdo informativo e manter ações somente no fluxo confirmado.
- Repetição de confirmação pode duplicar memória: usar identificação estável de ação/recomendação ou outra operação idempotente adequada ao fluxo existente.

## File list

- `docs/stories/assistant-client-intelligence.md` — escopo, critérios e validação.
- `docs/assistant-intelligence-setup.md` — ativação e exemplos de uso.
- `api/_assistant-memory.js` — persistência privada, validação e isolamento.
- `api/_assistant-diagnosis.js` — períodos, métricas e sinais de investigação.
- `api/_assistant-intelligence-tools.js` — ficha/memória, snapshots e assinatura de propostas.
- `api/_assistant-prompt.js` — método de análise e limites de interpretação.
- `api/_assistant-tools.js` — coleta Meta e integração do diagnóstico.
- `api/_assistant-google-tools.js` — ficha/memória na visão geral Google e desambiguação.
- `api/_assistant-write-tools.js` — preparação e execução confirmada de novas gravações.
- `api/assistant-chat.js` — ferramentas e observações restritas à requisição.
- `src/modules/assistant/AssistantWidget.jsx` — atalhos e propostas legíveis.
- `supabase/migrations/20261015000000_assistant_intelligence.sql` — tabelas privadas.
- `tests/assistant-intelligence.test.js` — persistência/isolamento/assinatura/fluxos.
- `tests/assistant-diagnostics.test.js` — datas/métricas/evidências/limitações.

## Resultados da validação

- `npm test`: **103/103 passando** após as últimas correções.
- Testes específicos: **20/20 passando**, cobrindo remoção de campos, nomes duplicados, snapshots por entidade e acompanhamento fora das 20 recomendações recentes.
- QA local: revisão independente aprovada após corrigir quatro achados P2; sem novos achados bloqueantes no escopo revisado.
- `npm run typecheck`: indisponível — o projeto não define esse script. Nenhuma validação TypeScript declarada.
- `npm run lint` e `npm run build`: em execução, aguardando leitura de dependências locais. Resultado final pendente.
- CodeRabbit: não disponível neste ambiente; não executado. A revisão local não é apresentada como execução do CodeRabbit.
- Sem teste com modelo/contas reais, sem aplicação remota de migration e sem deploy. A validação funcional remota depende da ativação descrita em `docs/assistant-intelligence-setup.md`.
