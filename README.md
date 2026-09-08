# Calls WPPConnect Server

Laboratório open source para estudar e implementar chamadas de voz e recuperação de mensagens no WPPConnect Server.

> [!IMPORTANT]
> Este repositório ainda não é um fork do WPPConnect. Nesta etapa ele preserva os resultados da investigação, os diagnósticos reproduzíveis e o plano da prova de conceito. Nenhuma ponte de áudio/SIP está pronta para produção.

## Objetivos

- controlar chamadas do WhatsApp Web a partir do Node/WPPConnect;
- transportar o áudio entre Chromium e Asterisk usando um cliente SIP;
- manter compatibilidade inicial com Asterisk 13 e `chan_sip`;
- recuperar mensagens recebidas ou enviadas enquanto uma instância esteve desconectada;
- validar tudo em laboratório antes de alterar as sessões em produção;
- evoluir posteriormente para um fork mínimo e fácil de atualizar.

## Estado atual

| Frente | Estado |
|---|---|
| Inventário de produção | Confirmado |
| Versões efetivamente carregadas | Confirmado |
| Análise do código upstream de chamadas | Concluída |
| Sinalização de chamada no navegador | Parcialmente confirmada |
| Pesquisa de histórico offline | Em investigação |
| Áudio virtual do Chromium | Não testado |
| Registro SIP e RTP | Não testado |
| Ponte WhatsApp ↔ Asterisk | Não implementada |
| Concorrência entre sessões | Não testada |

Consulte [STATUS.md](STATUS.md) para evidências, hipóteses e pendências.

## Descoberta principal da Fase 0

Na combinação WPPConnect 2.3.0 + WA-JS 4.6.0, o caminho nativo de VoIP mantém a chamada em `CallStore.activeCall`. Entretanto, o listener legado exposto pelo WPPConnect 2.3.0 observa apenas eventos `add` da coleção. A hipótese é que chamadas nativas possam não chegar ao `client.onIncomingCall`, apesar de existirem no navegador.

Veja a análise e os links para o código upstream em [docs/upstream-call-analysis.md](docs/upstream-call-analysis.md).

## Arquitetura candidata

```text
WhatsApp
  ↕
Chromium + WPPConnect/WA-JS
  ↕ áudio virtual
Cliente SIP
  ↕ SIP/RTP
Asterisk 13 (chan_sip)
  ↕
Ramal, fila ou URA
```

A candidata atual para laboratório é PulseAudio + Baresip. Isso ainda não é uma decisão definitiva.

## Estrutura

- `docs/architecture.md`: arquitetura e limites entre componentes;
- `docs/calls-poc.md`: fases e critérios da prova de conceito;
- `docs/upstream-call-analysis.md`: revisão do WPPConnect 2.3.0 e WA-JS 4.6.0;
- `docs/test-evidence-template.md`: roteiro para registrar testes sanitizados;
- `docs/offline-message-sync.md`: descobertas sobre histórico e contexto de mensagens;
- `docs/fork-strategy.md`: como transformar o laboratório em fork sem perder atualizações upstream;
- `research/browser/`: scripts somente leitura para o console do WhatsApp Web;
- `scripts/diagnostics/`: inventário seguro dos servidores.

## Regra de trabalho

A ordem é: documentar → observar → testar isoladamente → integrar → testar concorrência → liberar gradualmente.

Não execute mudanças de áudio, SIP ou PM2 diretamente na produção com base apenas nestes documentos.
