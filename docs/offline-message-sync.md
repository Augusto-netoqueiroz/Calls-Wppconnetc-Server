# Sincronização de mensagens após período offline

## Objetivo

Recuperar mensagens recebidas e enviadas enquanto uma instância esteve desconectada, preservando ordem, contexto e idempotência.

## Descobertas

A inspeção das mensagens deve considerar:

- conversa: `msg.id.remote`, `from` e `to`;
- ordenação: `t`, `timestamp` ou `__x_t`;
- valor real: propriedades diretas, modelos serializados e campos internos `__x_*`;
- origem comercial: CTWA, anúncio, campanha, template, referral e entry point.

O carregador webpack foi encontrado em `webpackChunkwhatsapp_web_client`. Uma referência ao `require` interno pode ser obtida em laboratório para inspecionar módulos e stores, mas isso é uma API privada e instável.

## Algoritmo proposto

1. manter cursor por sessão e chat;
2. usar uma pequena sobreposição temporal na reconexão;
3. buscar/carregar histórico até cobrir o intervalo;
4. normalizar IDs, remote e timestamp;
5. ordenar por timestamp e desempatar pelo ID;
6. deduplicar antes da entrega;
7. publicar contexto comercial normalizado;
8. confirmar o cursor somente depois que o consumidor persistir a mensagem.

## Idempotência

A chave preferencial é o ID serializado da mensagem. Quando indisponível, usar uma composição conservadora de sessão, remote, autor, timestamp e tipo, registrando que se trata de fallback.

## Cuidados

- stores e nomes internos podem mudar sem aviso;
- mensagens revogadas, editadas e reações exigem eventos próprios;
- histórico parcialmente carregado não significa sincronização completa;
- timestamps do cliente não devem ser o único marcador;
- não registrar conteúdo integral ou identificadores pessoais nos logs de diagnóstico.

## Próximo teste

Usar duas contas de laboratório:

1. registrar cursor;
2. desconectar a instância;
3. trocar mensagens nos dois sentidos;
4. reconectar;
5. executar a coleta;
6. repetir a coleta;
7. comprovar que a primeira recupera o intervalo e a segunda gera zero duplicatas.
