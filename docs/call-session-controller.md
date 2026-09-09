# Controlador de sessão de chamada

O módulo `src/call-session-controller.js` conecta os eventos dos adaptadores à máquina de estados por meio do orquestrador. Ele foi validado somente com adaptadores simulados.

## Responsabilidade

- conectar o controle local do Baresip;
- iniciar o observador WhatsApp/Puppeteer;
- encaminhar eventos WhatsApp, SIP e mídia em ordem;
- expor um estado sanitizado da chamada;
- bloquear uma segunda chamada na mesma sessão;
- impedir que o controlador seja parado durante uma chamada.

Ele não cria processos, filas, workers, dispositivos de áudio ou configurações do Asterisk. Em produção, a continuidade do processo permanece responsabilidade do PM2.

## Fluxos suportados nos testes

### WhatsApp para SIP

1. evento `incoming` do adaptador WhatsApp;
2. comando `sip.dial`;
3. evento `CALL_ESTABLISHED` do Baresip;
4. comando `whatsapp.accept`;
5. estado WhatsApp `active`;
6. comando `media.start`;
7. confirmação `started` da mídia.

### SIP para WhatsApp

1. chamada explícita de `startSipIncoming({ whatsappTarget })`;
2. comando `whatsapp.offer`;
3. estado WhatsApp `active`;
4. comando `sip.accept`;
5. evento `CALL_ESTABLISHED`;
6. comando `media.start`;
7. confirmação `started` da mídia.

Um evento `CALL_INCOMING` isolado não inicia a chamada porque não contém o destino WhatsApp. O controlador publica apenas `sipIncoming`; uma camada HTTP autenticada deverá fornecer o destino explicitamente em uma etapa posterior.

## Eventos públicos

| Evento | Conteúdo |
|---|---|
| `transition` | transição sanitizada da máquina de estados |
| `action` | ação executada, sem parâmetros |
| `actionFailure` | falha de ação já sanitizada pelo orquestrador |
| `controllerFailure` | origem e código da falha |
| `sipIncoming` | indicação sem alias ou identificador real |

## Limite atual

Ainda não há adaptador de mídia nem execução contra Baresip ou Chromium reais. O próximo incremento deve criar o contrato de mídia virtual com implementação simulada e testes de isolamento, sem instalar pacotes no servidor.
