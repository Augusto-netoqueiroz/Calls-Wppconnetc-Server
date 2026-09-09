# Estado da investigação

Atualizado em 9 de setembro de 2026.

## Confirmado

- ambiente Linux com Node.js, npm, WPPConnect, WA-JS e Puppeteer;
- múltiplas instâncias isoladas por processo e porta;
- a implementação efetivamente carregada pode diferir da versão declarada no projeto raiz;
- combinação instalada analisada: WPPConnect 2.3.0 e WA-JS 4.6.0;
- Asterisk 13 com `chan_sip` e codecs compatíveis disponível em servidor separado;
- a chamada do WhatsApp Web alcançou estado ativo em teste manual;
- o caminho nativo do WA-JS 4.6.0 usa `CallStore.activeCall`;
- `offer()` pode iniciar a chamada e retornar `undefined`, pois procura o modelo na coleção;
- o listener legado do WPPConnect 2.3.0 observa `CallStore.on('add')`;
- o WA-JS 4.6.0 possui evento próprio que também intercepta `setActiveCall`;
- foram identificados campos de contexto CTWA, anúncio, campanha, template, referral e entry point;
- o roteiro de laboratório para `CALL-01` a `CALL-05` está preparado com coleta sanitizada;
- `baresip-core` do Ubuntu 24.04 não fornece `pulse.so`, mas fornece `alsa.so`, `ctrl_tcp.so` e `g711.so`;
- `libasound2-plugins` fornece a ponte ALSA→PulseAudio usada pela arquitetura candidata revisada;
- cliente Node do `ctrl_tcp` implementado e validado somente contra servidor TCP simulado;
- máquina de estados bidirecional implementada e validada sem efeitos externos;
- orquestrador dos adaptadores implementado e validado somente com mocks;
- adaptador WhatsApp/Puppeteer implementado e validado somente com página simulada;
- a camada de áudio virtual e o cliente SIP ainda não estavam instalados no momento do inventário.

## Hipótese prioritária

O `client.onIncomingCall` do WPPConnect 2.3.0 pode não detectar chamadas do caminho VoIP nativo, enquanto `WPP.on('call.incoming_call')` e `CallStore.activeCall` podem detectá-las. Isso foi inferido do código upstream e ainda precisa de confirmação no runtime instalado.

## Ainda não confirmado

- comportamento comparado dos dois listeners durante a mesma chamada;
- execução do adaptador WhatsApp contra o Chromium de laboratório;
- aceitar, rejeitar e encerrar em todas as situações;
- áudio no Chromium headless;
- roteamento real do Baresip por `alsa,pulse`;
- comandos e eventos do adaptador contra uma instância Baresip real;
- integração do orquestrador com os adaptadores reais;
- isolamento por sessão;
- registro SIP, RTP e NAT;
- áudio bidirecional WhatsApp ↔ Asterisk;
- chamadas simultâneas;
- sincronização offline completa e idempotente;
- estabilidade depois de atualizações do WhatsApp Web ou WA-JS.

## Restrições decididas

- não instalar ou reiniciar serviços antes do laboratório;
- não usar sessão produtiva nas primeiras fases;
- iniciar com uma sessão por processo;
- não versionar tokens, perfis do Chromium, credenciais, endereços de rede ou dados pessoais;
- separar fatos confirmados de hipóteses.

O inventário operacional detalhado deve permanecer fora do repositório público.
