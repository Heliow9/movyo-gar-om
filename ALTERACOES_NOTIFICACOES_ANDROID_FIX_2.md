# Correção Android Push - Fix 2

Ajustes aplicados:

1. Registro do push Android imediatamente após login em `LoginScreen.js`.
2. Sincronizador global mantido em `PushSubscriptionSync.js`, agora com busca mais robusta de `restauranteId`.
3. Logs detalhados no Android para identificar se a falha está em sessão, geração de `ExpoPushToken` ou envio para `/api/push/subscribe`.
4. Suporte a diagnóstico visual opcional com `EXPO_PUBLIC_DEBUG_PUSH=1`.
5. Correção da notificação local imediata para usar `trigger: null`.

Para diagnosticar no Android, publique um build/update com:

```powershell
$env:EXPO_PUBLIC_DEBUG_PUSH="1"
eas update --branch preview --platform android --message "Debug push Android"
```

Se precisar incluir nativo novo, gere build novamente:

```powershell
eas build -p android --profile preview --clear-cache
```
