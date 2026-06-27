# Firebase e push Android do Movyo Hub

O pacote Android do Hub e `com.movyo.garcom`.

## Configuracao obrigatoria

1. No Firebase Console, abra o projeto usado pela Movyo.
2. Cadastre um aplicativo Android com o package `com.movyo.garcom`.
3. Baixe o `google-services.json` e coloque-o na raiz deste projeto.
4. Em Project settings > Service accounts, gere uma chave JSON de conta de servico.
5. No EAS, envie essa chave como credencial FCM V1 do projeto Android.
6. Gere um novo APK/AAB. Uma atualizacao OTA nao instala modulos nativos nem o Firebase.
7. Desinstale o APK antigo, instale o novo e ative as notificacoes no Hub.

## Build

```bash
eas credentials -p android
eas build -p android --profile apk
```

Para a Play Store:

```bash
eas build -p android --profile production
```

O `app.config.js` usa automaticamente `./google-services.json`. Em CI/EAS, tambem
aceita a variavel de arquivo `GOOGLE_SERVICES_JSON` apontando para esse arquivo.

Nao e necessario chamar `FirebaseApp.initializeApp()` manualmente. O plugin
`expo-notifications` e o `google-services.json` geram a inicializacao nativa no build.
