# Teste de sinalização de chamadas

Este roteiro valida `CALL-01` a `CALL-05` sem instalar áudio, SIP ou alterar o núcleo do WPPConnect.

## Limites do teste

- usar somente uma conta e um processo exclusivos de laboratório;
- não executar em portas ou sessões produtivas;
- não instalar PulseAudio/Baresip nesta fase;
- não registrar telefone, ID da chamada, sessão, token, IP ou conteúdo de mensagem;
- executar um teste por vez e aguardar o retorno ao estado `idle`.

## Instrumentos

### Navegador

`research/browser/call-signaling-lab.js` compara, na mesma linha do tempo:

- `WPP.on('call.incoming_call')`;
- `WAPI.onIncomingCall` usado pelo listener legado;
- polling de `CallStore.activeCall` a cada 250 ms.

IDs reais são convertidos apenas em aliases locais como `call-1`. O telefone usado em `offer()` não é armazenado nem impresso.

### Node/WPPConnect

`research/node/observe-wppconnect-incoming.js` registra se a API pública `client.onIncomingCall` recebeu a chamada. O observador também elimina identificadores do log.

## Preparação

1. Criar um processo separado, fora das portas produtivas.
2. Conectar apenas uma conta WhatsApp de laboratório.
3. Abrir o DevTools do Chromium desse processo.
4. Colar o conteúdo de `research/browser/call-signaling-lab.js` no console.
5. Confirmar que o evento inicial `CAPABILITIES` mostra as funções necessárias.
6. Anexar o observador Node ao `client` da sessão de laboratório.

Nenhuma ação de chamada é liberada inicialmente. Para habilitá-las no navegador:

```javascript
__wppCallLab.arm('LABORATORIO')
```

## CALL-01 — Oferta originada

Objetivo: confirmar que `offer()` pode retornar vazio enquanto `activeCall` existe.

```javascript
await __wppCallLab.offer('NUMERO_DE_TESTE@c.us')
```

Registrar:

- tipo do retorno, nunca o valor completo;
- momento em que `activeCall` apareceu;
- estados observados;
- retorno ao estado inativo após `end()` ou encerramento remoto.

**Aprovado:** a chamada inicia e a linha do tempo registra `active: true`, mesmo se `returnType` for `undefined`.

## CALL-02 e CALL-03 — Chamada recebida

Objetivo: comparar o evento atual do WA-JS com os listeners legados.

1. Com o laboratório em `idle`, ligar para a conta de teste.
2. Não atender durante os primeiros segundos.
3. Verificar a presença de eventos com as origens:
   - `wpp.incoming_call`;
   - `wapi.onIncomingCall`;
   - `activeCall`;
   - `client.onIncomingCall` no log Node.
4. Encerrar remotamente e aguardar `active: false`.

**CALL-02 aprovado:** `wpp.incoming_call` e `activeCall` detectam a mesma chamada sanitizada.

**CALL-03 confirmado:** `wapi.onIncomingCall` e `client.onIncomingCall` ficam ausentes para a chamada que foi vista pelos dois caminhos atuais. Esse resultado confirma a lacuna; ele não representa aprovação funcional.

## CALL-04 — Ciclo de estados

Executar uma chamada originada e uma recebida, separadamente.

**Aprovado:** `activeCall` aparece, registra as mudanças relevantes e desaparece depois do encerramento, sem permanecer ativo indevidamente.

## CALL-05 — Comandos sobre a chamada ativa

Executar em rodadas independentes:

```javascript
await __wppCallLab.accept()
await __wppCallLab.reject()
await __wppCallLab.end()
```

- `accept()` somente em uma chamada recebida;
- `reject()` somente em outra chamada recebida;
- `end()` em uma chamada ativa;
- nunca executar dois comandos concorrentes.

**Aprovado:** cada função retorna sucesso, atua sobre `call-N` ativo e a linha do tempo converge para o estado esperado.

## Coleta da evidência

No final de cada rodada:

```javascript
copy(__wppCallLab.exportJson())
__wppCallLab.disarm()
__wppCallLab.stop()
```

Salvar o JSON fora do repositório até revisar se não há dado pessoal. Depois preencher `docs/test-evidence-template.md` apenas com a evidência sanitizada.

## Decisão após os testes

- Se todos os caminhos detectarem a chamada, não alterar o listener.
- Se apenas WA-JS/`activeCall` detectarem a chamada nativa, implementar a adaptação mínima mantendo `client.onIncomingCall` compatível.
- Se nem `wpp.incoming_call` detectar, investigar inicialização/injeção do evento antes de alterar o WPPConnect.
- Áudio e SIP continuam bloqueados até a sinalização passar pelos testes.
