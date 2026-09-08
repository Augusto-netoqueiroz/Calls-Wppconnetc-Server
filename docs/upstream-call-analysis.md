# Análise upstream das chamadas

Análise realizada em 8 de setembro de 2026 sobre as versões encontradas no ambiente: WPPConnect 2.3.0 e WA-JS 4.6.0.

## Fontes revisadas

### WPPConnect 2.3.0

- [package.json](https://github.com/wppconnect-team/wppconnect/blob/v2.3.0/package.json)
- [WAPI onIncomingCall](https://github.com/wppconnect-team/wppconnect/blob/v2.3.0/src/lib/wapi/wapi.js)
- [ListenerLayer](https://github.com/wppconnect-team/wppconnect/blob/v2.3.0/src/api/layers/listener.layer.ts)

### WA-JS 4.6.0

- [offer](https://github.com/wppconnect-team/wa-js/blob/v4.6.0/src/call/functions/offer.ts)
- [getCall e activeCall](https://github.com/wppconnect-team/wa-js/blob/v4.6.0/src/call/functions/getCall.ts)
- [evento de chamada recebida](https://github.com/wppconnect-team/wa-js/blob/v4.6.0/src/call/events/registerIncomingCallEvent.ts)
- [accept](https://github.com/wppconnect-team/wa-js/blob/v4.6.0/src/call/functions/accept.ts)
- [reject](https://github.com/wppconnect-team/wa-js/blob/v4.6.0/src/call/functions/reject.ts)
- [end](https://github.com/wppconnect-team/wa-js/blob/v4.6.0/src/call/functions/end.ts)

## Descobertas

### 1. `offer()` pode retornar vazio mesmo iniciando a chamada

Depois de executar a função nativa de início, `offer()` procura o modelo com `CallStore.getModelsArray().find(...)`.

O próprio `getCall.ts` documenta que, no caminho VoIP nativo, o WhatsApp mantém a chamada somente em `CallStore.activeCall` e não a adiciona à coleção. Portanto, iniciar a ligação com sucesso e receber `undefined` como retorno é um comportamento coerente com o código atual.

**Impacto:** o adaptador não deve usar o retorno de `offer()` como única confirmação. Deve observar `activeCall`, estado e timeout.

### 2. Existem dois caminhos diferentes para chamada recebida

No WPPConnect 2.3.0, `WAPI.onIncomingCall` registra o callback em `CallStore.on('add')`.

No WA-JS 4.6.0, o evento `call.incoming_call` intercepta:

- `processIncomingCall`, para o caminho legado;
- `setActiveCall`, para o caminho VoIP nativo.

**Inferência pendente de teste:** `client.onIncomingCall` pode perder chamadas nativas, enquanto `WPP.on('call.incoming_call')` continua funcionando.

### 3. Aceitar e rejeitar agem sobre a chamada ativa

`accept()` e `reject()` localizam a chamada por `activeCall` e usam a interface VoIP nativa quando disponível. As funções internas nativas não recebem um ID; elas atuam sobre a chamada ativa.

**Impacto:** precisamos impor uma chamada ativa por sessão e validar o ID observado antes de qualquer ação.

### 4. Encerramento não depende de uma coleção

`end()` obtém a interface VoIP, marca `activeCall.userEndedCall` quando possível e chama `endCall`.

**Impacto:** o desligamento deve ser idempotente e tolerar a chamada já encerrada.

## Testes prioritários

| ID | Hipótese | Observação necessária |
|---|---|---|
| CALL-01 | `offer()` inicia e retorna vazio | retorno, `activeCall` e estados |
| CALL-02 | evento WA-JS detecta chamada nativa | `call.incoming_call` |
| CALL-03 | listener WPPConnect não recebe a mesma chamada | callback `client.onIncomingCall` |
| CALL-04 | `activeCall` acompanha todo o ciclo | transições até ficar vazio |
| CALL-05 | accept/reject/end atuam apenas na chamada ativa | ID antes/depois e resultado |

## Decisão provisória

Não alterar o núcleo agora. Primeiro comparar, na mesma chamada de laboratório:

1. evento WA-JS;
2. listener WPPConnect;
3. polling de `CallStore.activeCall`.

Se a lacuna for confirmada, a correção mínima será fazer o WPPConnect usar o evento `call.incoming_call` do WA-JS, preservando a API pública `client.onIncomingCall`.
