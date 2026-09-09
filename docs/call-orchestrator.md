# Orquestrador de chamadas

O módulo `src/call-orchestrator.js` conecta a máquina de estados pura aos adaptadores de WhatsApp, SIP e mídia. Ele ainda é uma peça de laboratório: os testes usam somente objetos simulados e não acessam WhatsApp, Baresip ou Asterisk reais.

## Responsabilidades

- aceitar o início de uma chamada recebida pelo WhatsApp ou pelo SIP;
- converter estados externos em eventos da máquina de estados;
- executar as ações resultantes de forma sequencial;
- aplicar timeout à fase de estabelecimento e cancelá-lo ao chegar em `active`;
- compensar falhas encerrando ou rejeitando o outro lado;
- publicar somente transições e códigos de erro sanitizados.

O orquestrador aceita somente uma chamada durante seu ciclo de vida. Para outra chamada, deve ser criada outra instância. Isso preserva o modelo inicial de uma sessão WhatsApp e um Baresip por processo.

## Contratos mínimos

| Adaptador | Métodos esperados |
|---|---|
| WhatsApp | `offer(target)`, `accept()`, `reject()`, `end()` |
| SIP | `dial(uri)`, `accept()`, `hangup()` |
| Mídia | `start()`, `stop()` |

Os métodos podem ser assíncronos. A conclusão de um comando não significa que o recurso já mudou de estado: o adaptador deve entregar depois o evento confirmado, como `CALL_ESTABLISHED` ou `MEDIA_STARTED`.

## Limites de segurança

- destinos SIP e WhatsApp são validados antes da fila de execução;
- destinos não aparecem nos eventos `transition`, `action` e `actionFailure`;
- mensagens originais dos adaptadores não são propagadas;
- o timeout usa relógio injetável, permitindo teste determinístico;
- falhas durante a compensação são registradas sem iniciar um ciclo recursivo.

## Próxima validação

Antes de conectar o módulo ao runtime real:

1. implementar um adaptador WhatsApp mínimo sobre a versão instalada;
2. implementar a camada de mídia como contrato isolado;
3. testar o orquestrador contra um Baresip local de laboratório;
4. repetir os cenários de sucesso, timeout e encerramento por cada lado;
5. somente então habilitar um endpoint HTTP em uma instância não produtiva.
