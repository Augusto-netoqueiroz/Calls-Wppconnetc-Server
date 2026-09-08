# Estado da investigação

Atualizado em 8 de setembro de 2026.

## Confirmado

- ambiente Linux com Node.js, npm, WPPConnect, WA-JS e Puppeteer;
- múltiplas instâncias isoladas por processo e porta;
- a implementação efetivamente carregada pode diferir da versão declarada no projeto raiz;
- Asterisk 13 com `chan_sip` e codecs compatíveis disponível em servidor separado;
- a chamada do WhatsApp Web alcançou estado ativo em teste manual;
- `CallStore.activeCall` é uma candidata para observar a chamada;
- foram identificados campos de contexto CTWA, anúncio, campanha, template, referral e entry point;
- a camada de áudio virtual e o cliente SIP ainda não estavam instalados no momento do inventário.

## Ainda não confirmado

- evento estável de chamada recebida no Node;
- aceitar, rejeitar e encerrar em todas as situações;
- áudio no Chromium headless;
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
