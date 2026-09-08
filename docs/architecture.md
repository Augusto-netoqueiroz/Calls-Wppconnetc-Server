# Arquitetura proposta

## Componentes

1. **WPPConnect Server** mantém a sessão e expõe a automação do WhatsApp.
2. **WA-JS no Chromium** fornece as operações e stores internos usados na sinalização.
3. **Adaptador de chamadas** traduz eventos do WhatsApp para uma máquina de estados estável.
4. **Camada de áudio virtual** separa entrada e saída de cada sessão.
5. **Cliente SIP** registra um ramal dedicado e transporta mídia.
6. **Asterisk 13 / chan_sip** encaminha para ramal, fila ou URA.

## Princípio de isolamento

Para a primeira prova de conceito:

- uma sessão WhatsApp;
- um processo PM2 de laboratório;
- um perfil Chromium;
- um par de dispositivos de áudio;
- um cliente/ramal SIP;
- no máximo uma chamada ativa.

Produção com múltiplas sessões no mesmo processo não será assumida como segura até o teste de concorrência.

## Fluxos desejados

### Chamada recebida no WhatsApp

1. detectar a oferta;
2. chamar o destino de laboratório no Asterisk;
3. aceitar o WhatsApp somente quando o lado SIP estiver pronto;
4. iniciar a ponte de áudio;
5. propagar desligamento em qualquer direção;
6. limpar recursos e registrar estados.

### Chamada originada no Asterisk

1. receber uma solicitação autenticada para uma sessão e contato;
2. reservar a sessão;
3. iniciar `WPP.call.offer`;
4. observar a chamada real no store;
5. conectar áudio quando atendida;
6. encerrar ambos os lados em falha, timeout ou desligamento.

### Sincronização offline

1. persistir por sessão o último marcador confirmado;
2. ao reconectar, listar mensagens posteriores ao marcador com sobreposição;
3. normalizar identificadores e timestamps;
4. deduplicar por ID composto;
5. publicar mensagens na ordem;
6. avançar o marcador somente após persistência bem-sucedida.

## Máquina de estados mínima

`idle → offering/ringing → connecting → active → ending → ended`

Estados terminais de erro devem preservar a causa: rejeitada, ocupada, timeout, falha do WhatsApp, falha SIP ou falha de mídia.

## Segurança

- credenciais apenas em variáveis de ambiente ou arquivos protegidos fora do Git;
- endpoints de chamada autenticados;
- firewall SIP/RTP restrito aos dois servidores;
- validação estrita de sessão, contato e destino;
- logs sem conteúdo de mensagem, tokens ou segredos por padrão;
- limites de timeout e uma chamada por sessão.
