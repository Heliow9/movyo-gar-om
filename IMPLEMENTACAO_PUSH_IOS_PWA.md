# Movyo Hub — Push no iPhone com o PWA fechado

## Diagnóstico do pacote recebido

O Hub já possuía:

- `manifest.json` com modo `standalone`;
- `service worker` com evento `push`;
- pedido de permissão por ação do usuário;
- notificações locais acionadas por Socket.IO.

Porém, a inscrição remota dependia de variáveis não configuradas e não havia evidência, neste pacote, dos endpoints da API que salvam a assinatura e enviam Web Push. Por isso, caixa e pedidos só notificavam enquanto o Hub estava aberto/ativo.

## Ajustes feitos no front-end

- Sincronização automática da assinatura após login, ao reabrir o PWA e a cada cinco minutos.
- Busca automática da chave pública VAPID em `GET /api/push/public-key` quando ela não estiver no build.
- Envio da assinatura para `POST /api/push/subscribe`.
- Banner não informa sucesso falso: diferencia permissão local de conexão real com o servidor.
- Evento `pedidoAtualizado` agora notifica quando o pedido entra em `em_producao`.
- Deduplicação separada para `novo` e `em_producao`.
- Service worker atualizado para interpretar payload de pedido e status.

## Contrato necessário na API

### 1. Chave pública

`GET /api/push/public-key`

Resposta:

```json
{
  "publicKey": "CHAVE_PUBLICA_VAPID"
}
```

### 2. Salvar inscrição

`POST /api/push/subscribe`

Requer o token normal do Hub e recebe:

```json
{
  "subscription": {
    "endpoint": "https://...",
    "expirationTime": null,
    "keys": {
      "p256dh": "...",
      "auth": "..."
    }
  },
  "restauranteId": "...",
  "plataforma": "ios-pwa",
  "standalone": true,
  "userAgent": "..."
}
```

A API deve persistir `endpoint`, `p256dh`, `auth`, `restauranteId`, usuário, plataforma, data da última sincronização e status ativo.

### 3. Disparo obrigatório

Sempre que um pedido for criado/atualizado para `em_producao`, a API deve enviar Web Push para todas as inscrições ativas daquele restaurante.

Payload recomendado:

```json
{
  "title": "Pedido entrou em produção",
  "body": "#BK00042 • Cliente • R$ 38,90",
  "tag": "pedido-ID_DO_PEDIDO-producao",
  "status": "em_producao",
  "pedidoId": "ID_DO_PEDIDO",
  "data": {
    "url": "/",
    "screen": "Pedidos",
    "pedidoId": "ID_DO_PEDIDO",
    "status": "em_producao"
  }
}
```

O mesmo mecanismo pode ser usado na abertura de caixa. Inscrições que retornarem HTTP `404` ou `410` no envio devem ser desativadas/removidas.

## Configuração

Opção recomendada: manter a chave privada VAPID apenas na API e expor somente a chave pública em `/api/push/public-key`.

Variáveis típicas da API:

```env
WEB_PUSH_SUBJECT=mailto:suporte@movyo.delivery
WEB_PUSH_PUBLIC_KEY=...
WEB_PUSH_PRIVATE_KEY=...
```

Nunca coloque `WEB_PUSH_PRIVATE_KEY` no Hub, no GitHub ou em variável `EXPO_PUBLIC_*`.

## Teste no iPhone

1. iOS/iPadOS 16.4 ou superior.
2. Abrir `https://hub.movyo.delivery`.
3. Compartilhar → Adicionar à Tela de Início.
4. Abrir pelo ícone instalado.
5. Entrar no restaurante e tocar em **Ativar agora**.
6. Confirmar que o banner desapareceu sem mensagem de falha de servidor.
7. Fechar totalmente o PWA.
8. Alterar um pedido para `em_producao` em outro dispositivo.
9. Confirmar o aviso na tela bloqueada/Central de Notificações.
