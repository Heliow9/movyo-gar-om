# Ajustes de notificações iOS/PWA

## Implementado
- Banner visível para ativação de notificações por toque do usuário.
- Orientação específica quando o iPhone ainda não abriu o app pela Tela de Início.
- Notificação para qualquer evento de novo pedido recebido pelo socket, sem restringir à origem vitrine.
- Notificação para eventos de abertura de caixa.
- Compatibilidade com nomes alternativos de eventos do socket.
- Preparação para Web Push remoto usando:
  - `EXPO_PUBLIC_WEB_PUSH_PUBLIC_KEY`
  - `EXPO_PUBLIC_WEB_PUSH_SUBSCRIBE_URL`
- React e React DOM fixados na mesma versão (`19.1.0`) para evitar o erro React #527.

## Importante no iPhone
O Safari só permite solicitar a permissão após uma ação direta do usuário. Por isso, a solicitação automática ao carregar a tela foi removida e substituída pelo botão **Ativar agora**.

No iOS, notificações web exigem que o site seja instalado em **Adicionar à Tela de Início** e aberto pelo ícone.

## Push com o PWA fechado
Notificações disparadas pelo socket funcionam enquanto o PWA está ativo. Para receber com o PWA totalmente fechado, configure Web Push no backend, salve a assinatura recebida no endpoint configurado e envie push nos eventos de caixa aberto e novo pedido.
