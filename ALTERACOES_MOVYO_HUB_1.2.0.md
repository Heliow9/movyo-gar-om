# Movyo Hub 1.2.0 — conformidade, relatórios e UI premium

## Acesso, licença e segurança

- validação do restaurante/garçom no login;
- validação protegida ao abrir o app, a cada 45 segundos e ao voltar ao primeiro plano;
- reconhecimento dos códigos oficiais `RESTAURANTE_BLOQUEADO`, `LICENCA_VENCIDA` e `GARCOM_DESATIVADO`;
- desconexão do Socket e limpeza completa da sessão;
- tela premium específica para bloqueio, vencimento ou acesso desativado;
- sincronização de dados e permissões do garçom por `GET /api/garcons/app/me`.

## Dashboard do restaurante

- indicadores financeiros usando a rota oficial de relatórios da API;
- faturamento, ticket médio, pedidos confirmados e mesas ocupadas;
- formas de pagamento;
- saúde da internet, Socket, caixa, vitrine, Mercado Pago e WhatsApp;
- inventário rápido de categorias, produtos, mesas e garçons;
- pedidos recentes com ações rápidas;
- menu inferior reduzido e menu “Mais” para evitar itens espremidos.

## Relatórios

- período inicial/final;
- agrupamento por data, caixa ou operador;
- faturamento confirmado, ticket médio, pedidos e caixas;
- dinheiro, Pix, crédito, débito, online e outros;
- sangrias e suprimentos;
- detalhamento por agrupamento.

A fonte financeira é a API. O Hub não soma pedidos localmente.

## UI e UX

- Safe Area no iOS;
- bordas e espaçamento compatíveis com Android edge-to-edge;
- navegação inferior com indicador ativo e badge;
- layout responsivo para celulares e tablets;
- login rolável, evitando corte pelo teclado ou em telas menores;
- feedback de sincronização, rede e reconexão;
- pull-to-refresh;
- permissões individuais para operadores de caixa.

## Versão

- aplicativo: `1.2.0`;
- Android `versionCode`: `2`;
- iOS `buildNumber`: `2`.
