# Plano da prova de conceito de chamadas

Nenhuma fase seguinte deve começar sem cumprir o critério da anterior.

## Fase 0 — Inventário somente leitura

- mapear sessões por processo;
- confirmar APIs e eventos presentes na versão instalada;
- revisar criação do Chromium;
- documentar rede, NAT, SIP e RTP;
- registrar versões efetivamente resolvidas pelo Node.

**Critério:** inventário reproduzível, sem mudança em produção.

## Fase 1 — Sinalização WhatsApp

Em uma conta e processo de laboratório:

- consultar `WPP.call` e stores disponíveis;
- iniciar e localizar uma chamada;
- acompanhar transições;
- encerrar;
- detectar, aceitar e rejeitar uma chamada recebida.

**Critério:** controlar a sinalização pelo Node sem depender de operação manual no DevTools.

## Fase 2 — Áudio do Chromium

- executar `AUDIO-00` a `AUDIO-05` descritos em `audio-feasibility-study.md`;
- criar entrada e saída virtuais exclusivas;
- confirmar que o Chromium headless reconhece os dispositivos;
- capturar o áudio remoto;
- injetar um áudio de teste;
- medir eco, perda e mistura.

**Critério:** áudio bidirecional verificado sem Asterisk.

## Fase 3 — SIP isolado

- registrar um cliente SIP de laboratório;
- ligar para um ramal de teste;
- validar sinalização, RTP, NAT, alaw/ulaw e desligamento;
- testar os dois sentidos.

**Critério:** chamada SIP estável sem Chromium.

## Fase 4 — Ponte manual

- conectar uma chamada WhatsApp a uma SIP;
- atender e desligar manualmente;
- manter chamada por pelo menos 15 minutos;
- testar desligamento por ambos os lados.

**Critério:** áudio bidirecional, sem vazamento e com limpeza completa.

## Fase 5 — Automação

Implementar adaptadores e endpoints somente após a ponte manual:

- iniciar, aceitar, rejeitar e encerrar;
- consultar estado;
- correlacionar chamada WhatsApp e canal SIP;
- timeout, ocupado, rejeição e falhas;
- webhook e logs estruturados.

**Critério:** ciclo completo repetível e recuperação após falha.

## Fase 6 — Concorrência e liberação

- duas portas simultâneas;
- isolamento de áudio;
- consumo de CPU/memória;
- reinício isolado;
- falha SIP sem derrubar sessão WhatsApp;
- liberação gradual por porta.

## Matriz de evidências

Cada teste deve registrar: versão, sessão de laboratório, horário, ação, estado esperado, estado observado, logs sanitizados e resultado. Nunca versionar números pessoais, tokens ou senhas.
