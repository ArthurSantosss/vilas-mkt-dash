# Remover aba Relatório PDF

Status: Ready for Review
Responsável pela criação: @sm

## Pedido

Como usuário, quero remover a aba de relatórios em PDF do dashboard.

## Critérios de aceitação

- [x] O item Relatório PDF não aparece na navegação desktop nem mobile.
- [x] A página de relatório PDF deixa de ser renderizada; sua URL antiga redireciona para `/`.
- [x] As demais opções de navegação continuam disponíveis.

## Implementação e validação

- [x] Remover o item de navegação em `src/layout/Sidebar.jsx`.
- [x] Desativar a página e redirecionar sua rota antiga em `src/App.jsx`.
- [x] Executar `npm run build` e registrar o resultado.
- [x] Executar `npm run lint` e registrar o resultado.
- [x] Verificar os gates `npm run typecheck` e `npm test`, registrando eventuais limitações do projeto.
- [x] Atualizar o status, checklist e lista de arquivos após a implementação.

## Resultados das verificações

`npm run build`: concluído com sucesso.

`npm run lint`: nenhum erro; dois avisos existentes em arquivos fora desta alteração.

`npm run typecheck` e `npm test`: indisponíveis, pois o projeto não define esses scripts.

Navegação desktop e mobile compartilham a lista atualizada; a rota antiga redireciona para `/`.

## File list

- `src/layout/Sidebar.jsx`
- `src/App.jsx`
- `docs/stories/remove-pdf-tab.md`
