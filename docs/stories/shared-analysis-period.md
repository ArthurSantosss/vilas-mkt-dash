# Compartilhar o período de análise entre Meta e Google

Status: In Progress
Responsável pela criação: @sm

## Pedido

Como usuário, quero que Meta Ads e Google Ads mantenham o mesmo período de análise ao alternar entre as abas, sem precisar selecionar novamente as datas.

## Diagnóstico e escopo

Os providers de Meta e Google mantêm estados `selectedPeriod` independentes. O Dashboard sincroniza os períodos apenas localmente, o que não garante a mesma seleção nas demais abas.

A implementação planejada cria um `AnalysisPeriodContext` comum acima dos dois providers. Ambos passam a consumir esse estado, preservando a API existente para seus consumidores. O Dashboard usa apenas um setter para atualizar o período compartilhado.

Os relatórios mantêm seu período local, já compartilhado entre formatos e plataformas. A mudança não deve desfazer a otimização anterior de consultas dos relatórios.

## Critérios de aceitação

- [ ] Selecionar um período predefinido no Meta atualiza o período usado no Google, e vice-versa.
- [ ] Selecionar um intervalo personalizado no Meta atualiza as mesmas datas no Google, e vice-versa.
- [ ] Alternar entre abas não redefine o período de análise selecionado.
- [ ] O Dashboard exibe e atualiza o mesmo período compartilhado pelas duas plataformas.
- [ ] Uma alteração de período no Dashboard usa uma única atualização do estado compartilhado, sem setters redundantes para cada plataforma.
- [ ] Os consumidores dos providers Meta e Google continuam usando a API existente de período.
- [ ] O período dos relatórios permanece local e compartilhado entre seus formatos e plataformas, sem provocar atualizações do período global.

## Implementação e validação

- [x] Registrar pedido, diagnóstico e critérios antes da implementação.
- [ ] Criar o contexto comum de período acima dos providers Meta e Google.
- [ ] Substituir os estados independentes dos providers pelo contexto compartilhado.
- [ ] Simplificar a atualização de período do Dashboard para um único setter.
- [ ] Verificar presets e intervalos personalizados nos dois sentidos e a preservação da seleção ao navegar.
- [ ] Verificar a coerência do Dashboard e a ausência de atualização redundante.
- [ ] Verificar a preservação do período local dos relatórios.
- [ ] Executar `npm run build` e registrar o resultado.
- [ ] Executar `npm run lint` e registrar o resultado.
- [ ] Executar `npm test` e registrar o resultado.
- [ ] Verificar `npm run typecheck` e registrar o resultado ou sua indisponibilidade.
- [ ] Atualizar status, checklist, resultados e file list após a implementação.

## CodeRabbit Integration

A revisão deve verificar o posicionamento do provider compartilhado, a remoção dos estados independentes, a compatibilidade da API dos contextos, atualizações redundantes e a preservação do isolamento dos relatórios. O veredicto de qualidade pertence a @qa. CodeRabbit ainda não foi executado.

## Resultados das verificações

Implementação e validações pendentes.

## File list

- `docs/stories/shared-analysis-period.md`

A lista de arquivos efetivamente alterados deve ser atualizada após a implementação.
