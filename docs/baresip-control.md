# Controle local do Baresip

O módulo `src/baresip-control.js` implementa o cliente Node para o `ctrl_tcp` do Baresip 1.0.0 sem dependências externas.

Ele ainda não foi executado contra o Baresip real. Os testes atuais usam um servidor TCP simulado no loopback.

## Protocolo validado

O `ctrl_tcp` recebe JSON enquadrado em netstring:

```text
TAMANHO:{"command":"dial","params":"sip:destino","token":"..."},
```

O tamanho é calculado em bytes UTF-8, não em quantidade de caracteres. O adaptador suporta frames fragmentados e vários frames no mesmo pacote TCP.

Fonte: [ctrl_tcp do Baresip 1.0.0](https://github.com/baresip/baresip/blob/v1.0.0/modules/ctrl_tcp/ctrl_tcp.c).

## Segurança aplicada

- aceita apenas `127.0.0.1`, `::1` ou `localhost`;
- limita cada frame a 1 MiB;
- valida URI antes de `dial`;
- aplica timeout por comando;
- encerra a conexão em frame ou JSON inválido;
- não inclui `peeruri`, `accountaor`, ID real ou parâmetros nos eventos públicos;
- converte o ID em alias temporário como `sip-call-1`.

O retorno textual de `callStatus()` e `registrationInfo()` pode conter dados SIP. Ele deve ser usado para diagnóstico local e não deve ser enviado diretamente para logs ou APIs.

## API mínima

```javascript
const { BaresipControlClient } = require('./src/baresip-control');

const baresip = new BaresipControlClient({
  host: '127.0.0.1',
  port: 4444,
  timeoutMs: 5000
});

baresip.on('baresipEvent', event => {
  console.log('[BARESIP EVENT]', event);
});

await baresip.connect();
await baresip.dial('sip:destino@127.0.0.1');
await baresip.accept();
await baresip.hangup();
```

## Configuração mínima esperada

Os comandos de chamada pertencem ao `menu.so`; `ctrl_tcp.so` apenas encaminha o JSON ao registro de comandos.

```text
call_max_calls 1
audio_player alsa,pulse
audio_source alsa,pulse

module alsa.so
module g711.so
module_app menu.so
module_app ctrl_tcp.so

ctrl_tcp_listen 127.0.0.1:4444
```

O pacote `.deb` `baresip-core` 1.0.0-4build14 contém `menu.so`, `ctrl_tcp.so`, `alsa.so` e `g711.so`. Isso foi verificado inspecionando o pacote oficial sem instalá-lo.

## Próximos testes

| ID | Teste | Situação |
|---|---|---|
| SIPCTL-01 | conectar ao `ctrl_tcp` real no loopback | Pendente |
| SIPCTL-02 | executar `reginfo` sem registrar dados sensíveis | Pendente |
| SIPCTL-03 | executar `dial` para destino de laboratório | Pendente |
| SIPCTL-04 | receber `CALL_ESTABLISHED` sanitizado | Pendente |
| SIPCTL-05 | executar `hangup` e receber `CALL_CLOSED` | Pendente |
| SIPCTL-06 | recuperar após queda do processo Baresip | Pendente |

Nenhum desses testes deve usar ramal, destino ou servidor de produção.
