# Adaptador de chamadas do WhatsApp

O módulo `src/whatsapp-call-adapter.js` encapsula o acesso do Node à página Puppeteer. Nesta etapa ele foi validado somente com uma página simulada e com um contexto de navegador em memória.

## O que ele encapsula

- `WPP.call.offer`, `accept`, `reject` e `end`;
- `WPP.on('call.incoming_call')`;
- leitura periódica de `WPP.whatsapp.CallStore.activeCall`;
- conversão dos estados conhecidos para `ringing`, `active`, `ended` ou `failed`;
- remoção do listener e do binding ao encerrar.

O ID nativo da chamada é usado apenas dentro do navegador ao aceitar ou rejeitar. Ele não é retornado ao Node, não aparece em eventos e não entra nos logs do adaptador.

## Compatibilidade de estados

O WA-JS 4.6.0 declara duas famílias de estados: nomes legados e números usados pelo VoIP nativo. O adaptador reconhece somente os valores necessários ao controle seguro.

| Evento normalizado | Exemplos reconhecidos |
|---|---|
| `ringing` | `INCOMING_RING`, `OUTGOING_RING`, `1`, `2`, `3`, `8`, `12`, `14` |
| `active` | `ACTIVE`, `6` |
| `failed` | `CONNECTION_LOST`, `FAILED` |
| `ended` | `ENDED`, `REJECTED`, `NOT_ANSWERED`, `0`, `7`, `13` |

Um estado desconhecido é emitido apenas como observação com `state: null`. Ele não é convertido em transição e não inicia nenhuma ação.

Referências da versão analisada:

- [enum `CALL_STATES`](https://github.com/wppconnect-team/wa-js/blob/v4.6.0/src/whatsapp/enums/CALL_STATES.ts);
- [evento `call.incoming_call`](https://github.com/wppconnect-team/wa-js/blob/v4.6.0/src/call/events/registerIncomingCallEvent.ts);
- [`offer()`](https://github.com/wppconnect-team/wa-js/blob/v4.6.0/src/call/functions/offer.ts);
- [`accept()`](https://github.com/wppconnect-team/wa-js/blob/v4.6.0/src/call/functions/accept.ts);
- [`reject()`](https://github.com/wppconnect-team/wa-js/blob/v4.6.0/src/call/functions/reject.ts);
- [`end()`](https://github.com/wppconnect-team/wa-js/blob/v4.6.0/src/call/functions/end.ts).

## Limites atuais

- não foi executado contra Chromium real;
- a diferença entre evento WA-JS e listener público do WPPConnect continua pendente de laboratório;
- ainda não existe ligação automática entre os eventos deste adaptador e o orquestrador;
- permissões de microfone e roteamento de áudio não fazem parte deste módulo.

O próximo teste deve conectar este adaptador a uma página Puppeteer exclusiva de laboratório e executar `CALL-01` a `CALL-05`, sem SIP e sem áudio.
