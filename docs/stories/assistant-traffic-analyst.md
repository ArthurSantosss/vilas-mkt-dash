# Story: Assistente como analista sênior de tráfego (identificação de gargalos)

**Status:** InProgress

## Contexto

A assistente (Jarvis) já tem diagnóstico Meta determinístico, memória por cliente e guardrails de escrita, mas enxerga
poucos dados (só conta/campanha/anúncio com métricas de topo de funil) e o prompt ensina cautela, não método. Resultado:
respostas corretas porém genéricas. Objetivo: transformá-la em analista de gestão de tráfego que localiza o gargalo
de cada conta e sugere ações específicas, sem perder os guardrails existentes.

## Critérios de aceite

- [x] Motor: `claude-opus-5-5` (sobrescrevível por `ANTHROPIC_MODEL`), esforço por pedido (`high` em análises, `medium` em consultas pontuais; `ANTHROPIC_EFFORT` fixa), fallback server-side
      em recusas, mais rodadas de ferramentas com orçamento de tempo que força a conclusão antes do limite da função.
- [x] Decomposição determinística da variação do custo por resultado em entrega (CPM), atração (CTR de link) e
      conversão pós-clique (resultados/clique).
- [x] Distância da meta: CPM máximo, CTR necessário e conversão necessária para atingir a meta da ficha.
- [x] Funil pós-clique Meta: clique → visualização de página → carrinho → checkout → compra / lead / mensagem;
      hook rate e hold rate de vídeo.
- [x] Classificação de gargalos por etapa (entrega, atração, pós-clique, conversão, estrutura) com evidência,
      severidade heurística e próxima investigação sugerida, anexada ao `diagnose_account`.
- [x] Conversão principal inferida pelo maior volume quando a ficha não informa, sempre sinalizada como inferida.
- [x] Novas ferramentas Meta: `analyze_adsets`, `analyze_creatives`, `get_breakdown`, `get_daily_trend`, `scan_portfolio`.
- [x] Nova ferramenta Google: `analyze_google_account` (parcela de impressões perdida por orçamento/ranking,
      termos de pesquisa com gasto sem conversão, palavras-chave com índice de qualidade baixo).
- [x] Prompt com playbook de analista: ordem de investigação, leitura combinada de sinais e formato de recomendação.
- [x] Testes unitários para os cálculos puros (12 novos; 42/42 nos testes da assistente); ESLint sem problemas nos arquivos alterados.
- [ ] Validação ao vivo contra a Graph API (bloqueada: token Meta local invalidado pela Facebook).

## Fora de escopo

- Integração com CRM (qualidade de lead, receita real).
- Execução automática de ações sem confirmação.

## File List

- `api/_assistant-bottleneck.js` (novo) — cálculos puros: funil, decomposição de custo, meta, estrutura, criativos,
  breakdowns, tendência diária, triagem de carteira, gargalos Google.
- `api/_assistant-analyst-tools.js` (novo) — ferramentas de leitura Meta/Google de aprofundamento.
- `api/_assistant-diagnosis.js` — exporta eventos e janela de dias completos.
- `api/_assistant-tools.js` — `diagnose_account` com funil, decomposição, estrutura e gargalos.
- `api/_assistant-intelligence-tools.js` — observação inclui gargalos para recomendações salvas.
- `api/_assistant-prompt.js` — playbook de analista.
- `api/assistant-chat.js` — modelo, esforço, fallback, orçamento de tempo, novas ferramentas.
- `vercel.json` — `maxDuration` explícito do chat.
- `tests/assistant-bottleneck.test.js` (novo).
- `tests/assistant-effort.test.js` (novo) — escolha de esforço por pedido.

## Dev Notes

- Velocidade/custo: esforço escolhido por pedido e fixo durante o loop (preserva o cache do prefixo); prompt pede resposta proporcional à pergunta e consultas independentes na mesma rodada.

- Fallback server-side (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`) só é enviado para modelos que o aceitam.
- O aviso de conclusão por tempo é anexado após os tool_results (histórico append-only, compatível com preserved thinking).
- `ANTHROPIC_MODEL` no `.env` local atualizado para `claude-opus-5-5`; conferir a mesma variável na Vercel.
- `learning_stage_info` tem fallback: se a API recusar o campo, os conjuntos voltam sem a fase de aprendizado e a limitação é declarada.
