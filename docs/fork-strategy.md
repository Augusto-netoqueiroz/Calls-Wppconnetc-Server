# Estratégia para o futuro fork

## Situação atual

Este repositório é um laboratório independente. Ele não contém o histórico upstream e ainda não deve ser divulgado como fork funcional.

## Migração recomendada

Quando a prova de viabilidade estiver aprovada:

1. criar o fork oficial do repositório WPPConnect correspondente;
2. adicionar o upstream e preservar seu histórico;
3. portar cada mudança do laboratório em commits pequenos;
4. manter adaptadores próprios fora dos núcleos mais voláteis;
5. documentar versões compatíveis de WPPConnect, WA-JS, Puppeteer e WhatsApp Web;
6. executar os testes antes de atualizar o upstream.

## Regra de alteração mínima

Priorizar, nesta ordem:

1. extensão por API pública;
2. módulo isolado no servidor REST;
3. adaptador de página/WA-JS;
4. alteração no núcleo do WPPConnect apenas quando inevitável.

Cada uso de API privada deve ficar concentrado em um único adaptador e possuir detecção de capacidade, logs e fallback seguro.

## Versionamento

Não declarar versões diferentes no projeto raiz e na dependência sem explicar qual implementação é executada. O build e a inicialização devem imprimir versões resolvidas, nunca credenciais ou caminhos de tokens.
