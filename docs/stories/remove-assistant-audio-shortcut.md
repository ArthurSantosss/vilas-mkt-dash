# Remover transcrição de áudio e atalho do assistente IA

Status: Ready for Review
Responsável pela criação: @sm

## Pedido

Como usuário, quero remover a opção de transcrever áudio do assistente de IA e seu botão flutuante no canto inferior direito. O pedido complementar remove também o alto-falante e a leitura das respostas em voz alta.

## Critérios de aceitação

- [x] O assistente não exibe o botão de microfone nem a opção de transcrever áudio.
- [x] O assistente não utiliza `SpeechRecognition` nem `webkitSpeechRecognition`.
- [x] O botão flutuante de acesso ao assistente no canto inferior direito é removido.
- [x] O acesso ao assistente pelo menu e a conversa por texto continuam disponíveis.

- [x] Remover o botão de alto-falante e a síntese de voz.

## Implementação e validação

- [x] Remover a interface e a lógica de transcrição de áudio em `src/modules/assistant/AssistantWidget.jsx`.
- [x] Remover o botão flutuante, preservando a abertura pelo menu e o chat por texto.
- [x] Executar `npm run build` e registrar o resultado.
- [x] Executar `npm run lint` e registrar o resultado.
- [x] Verificar `npm run typecheck` e registrar o resultado ou a limitação do projeto.
- [x] Verificar `npm test` e registrar o resultado ou a limitação do projeto.
- [x] Atualizar o status, checklist e lista de arquivos após a implementação.

## Resultados das verificações

`npm run build`: concluído com sucesso.

`npm run lint`: nenhum erro; dois avisos preexistentes fora desta alteração.

`npm run typecheck` e `npm test`: scripts não definidos no projeto.

Verificação estática: removidos reconhecimento de voz, síntese de voz, microfone, alto-falante e botão flutuante; preservados evento de abertura pelo menu e envio de mensagens por texto.

## File list

- `src/modules/assistant/AssistantWidget.jsx`
- `docs/stories/remove-assistant-audio-shortcut.md`
