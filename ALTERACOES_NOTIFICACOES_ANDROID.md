# Ajuste — Notificações Android

Implementado suporte nativo de notificações no app Android da Movyo Hub para manter o mesmo comportamento operacional do PWA.

## O que foi alterado

- Adicionado `expo-notifications` compatível com Expo SDK 54.
- Configurado canal Android `movyo-pedidos` com alta prioridade, som e vibração.
- Adicionadas permissões Android de notificação e vibração no `app.json`.
- O app agora solicita/sincroniza permissão de notificações após login.
- O app tenta registrar o `ExpoPushToken` no endpoint `/api/push/subscribe` usando `plataforma: "android-app"` e `tipo: "expo"`.
- Eventos de socket de pedidos, abertura de caixa e fechamento de caixa agora disparam notificação nativa no Android.
- O fallback por `Alert.alert` foi mantido caso a permissão esteja negada ou a notificação nativa não esteja disponível.
- O PWA continua usando Web Push/Service Worker, sem carregar o módulo nativo no build web.

## Arquivos principais

- `src/utils/nativeNotifications.native.js`
- `src/utils/nativeNotifications.web.js`
- `src/utils/pwaNotifications.js`
- `src/components/PushSubscriptionSync.js`
- `src/screens/HomeScreen.js`
- `src/screens/HubRestauranteScreen.js`
- `app.json`
- `package.json`
- `package-lock.json`

## Observação importante

Para receber notificação com o app Android fechado, a API precisa aceitar o payload nativo salvo em `/api/push/subscribe` e enviar a mensagem pelo Expo Push Service/FCM para o `ExpoPushToken`. Com o app aberto/conectado no socket, os eventos já exibem notificação local nativa no Android.
