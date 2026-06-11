# Movyo Hub Restaurante — PWA iOS/Android

Esta versão recebeu suporte PWA básico para instalação pela tela inicial, notificações web, alerta local de novo pedido, som e vibração quando suportado pelo aparelho.

## O que foi adicionado

- `public/manifest.json` ajustado para Movyo Hub.
- `public/sw.js` com cache básico, recebimento de Web Push e clique abrindo `/pedidos`.
- `src/utils/pwaNotifications.js` com funções seguras para:
  - registrar Service Worker;
  - pedir permissão de notificação;
  - detectar iOS e modo instalado;
  - tocar som de novo pedido;
  - vibrar quando o navegador permitir;
  - exibir notificação local;
  - preparar inscrição Web Push remota.
- `src/main.jsx` registra o Service Worker automaticamente no web.
- `src/components/PedidosEmAndamento.jsx` dispara alerta local, som e vibração ao receber `novoPedido` via socket.
- `src/pages/Configuracoes.jsx` mostra um bloco “PWA no celular” com botão para ativar notificações no aparelho.

## Importante sobre iPhone

No iOS, as notificações web funcionam somente quando:

1. O iPhone está no iOS 16.4 ou superior.
2. O usuário abre o sistema no Safari.
3. Clica em Compartilhar > Adicionar à Tela de Início.
4. Abre a Movyo Hub pelo ícone instalado.
5. Clica em “Ativar notificações neste aparelho”.

A vibração no iPhone via PWA/navegador não é confiável. No Android a vibração funciona melhor.

## Push remoto pelo servidor

O código já está preparado para salvar inscrição Push no backend se estas variáveis existirem no ambiente web:

```env
VITE_WEB_PUSH_PUBLIC_KEY=sua_chave_publica_vapid
VITE_WEB_PUSH_SUBSCRIBE_URL=https://api.movyo.delivery/api/push/subscribe
```

O backend precisa receber e salvar o objeto `subscription` enviado pelo navegador. Depois, para enviar push, use a biblioteca `web-push` no Node.js com as chaves VAPID.

Exemplo de payload recomendado:

```json
{
  "title": "Novo pedido recebido na Movyo",
  "body": "#BK00091 • João • R$ 34,00",
  "tag": "pedido-BK00091",
  "data": { "url": "/pedidos", "pedidoId": "ID_DO_PEDIDO" }
}
```

## Teste rápido

1. Rode o web em HTTPS ou localhost.
2. Abra Configurações > bloco PWA no celular.
3. Clique em “Ativar notificações neste aparelho”.
4. Gere um novo pedido. O painel deve tocar som, tentar vibrar e mostrar notificação local se permitido.

